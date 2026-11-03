import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const originAllowed = "https://hub-google.github.io";
function headers(origin: string | null) {
  return { "content-type": "application/json", "access-control-allow-origin": origin === originAllowed ? originAllowed : originAllowed, "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "vary": "Origin" };
}
function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keyMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  return keyMap.default || Object.values(keyMap)[0];
}
function service() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = secretKey();
  if (!url || typeof key !== "string") throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function bearer(req: Request) {
  const match = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) throw new Error("LOGIN_REQUIRED");
  return match[1];
}
async function identity(req: Request, db: ReturnType<typeof service>) {
  const token = bearer(req);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("INVALID_SUPABASE_SESSION");
  return data.user;
}
async function lineVerify(idToken: string) {
  const channelId = Deno.env.get("LINE_LOGIN_CHANNEL_ID");
  if (!channelId) throw new Error("LINE_LOGIN_NOT_CONFIGURED");
  const form = new URLSearchParams({ id_token: idToken, client_id: channelId });
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
  });
  if (!response.ok) throw new Error("INVALID_LINE_ID_TOKEN");
  const profile = await response.json();
  if (profile.aud !== channelId || !/^U[a-f0-9]{32}$/i.test(profile.sub || "")) throw new Error("INVALID_LINE_IDENTITY");
  return profile as { sub: string; name?: string };
}
async function webhook(req: Request, origin: string | null) {
  const secret = Deno.env.get("LINE_MESSAGING_CHANNEL_SECRET");
  if (!secret) return reply(503, { error: "LINE_WEBHOOK_NOT_CONFIGURED" }, origin);
  const original = await req.text();
  const signature = req.headers.get("x-line-signature") || "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(original)));
  const computed = btoa(String.fromCharCode(...signed));
  if (signature.length !== computed.length) return reply(401, { error: "INVALID_SIGNATURE" }, origin);
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch) return reply(401, { error: "INVALID_SIGNATURE" }, origin);
  try { JSON.parse(original); } catch { return reply(400, { error: "INVALID_JSON" }, origin); }
  return reply(200, { ok: true }, origin);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "webhook") {
    if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);
    return webhook(req, origin);
  }
  if (req.method === "GET" && url.searchParams.get("action") === "config") {
    return reply(200, { liffId: Deno.env.get("LINE_LIFF_ID") || null, loginReady: !!Deno.env.get("LINE_LOGIN_CHANNEL_ID"), messagingReady: !!Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN") }, origin);
  }
  if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);
  if (origin && origin !== originAllowed) return reply(403, { error: "ORIGIN_DENIED" }, origin);
  try {
    const payload = await req.json();
    const db = service();
    const user = await identity(req, db);
    if (payload.action === "link") {
      const slug = String(payload.slug || "");
      const idToken = String(payload.idToken || "");
      if (!slug || !idToken || idToken.length > 10000) return reply(400, { error: "BAD_REQUEST" }, origin);
      const line = await lineVerify(idToken);
      const { data: tenant, error: te } = await db.from("so_tenants").select("id,slug,status").eq("slug", slug).eq("status", "ACTIVE").single();
      if (te || !tenant) return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { error } = await db.from("so_line_links").upsert({ tenant_id: tenant.id, user_id: user.id, line_sub: line.sub, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,user_id" });
      if (error) throw error;
      return reply(200, { ok: true, linked: true, displayName: line.name || null }, origin);
    }
    if (payload.action === "notify") {
      const slug = String(payload.slug || "");
      const number = String(payload.number || "");
      if (!/^A\d{3,}$/.test(number) || !slug) return reply(400, { error: "BAD_REQUEST" }, origin);
      const channelToken = Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
      if (!channelToken) return reply(503, { error: "LINE_MESSAGING_NOT_CONFIGURED" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,name").eq("slug",slug).single();
      if (!tenant) return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: member } = await db.from("so_members").select("role").eq("tenant_id", tenant.id).eq("user_id",user.id).maybeSingle();
      const { data: admin } = await db.from("so_platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
      if (!member && !admin) return reply(403, { error: "STAFF_REQUIRED" }, origin);
      const taipeiDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const ticketNo = Number(number.substring(1));
      const { data: ticket } = await db.from("so_tickets").select("id,user_id,status,updated_at").eq("tenant_id",tenant.id).eq("business_date",taipeiDate).eq("ticket_no",ticketNo).single();
      if (!ticket || ticket.status !== "CALLED" || Math.abs(Date.now()-Date.parse(ticket.updated_at)) > 90_000) return reply(409, { error: "TICKET_NOT_RECENTLY_CALLED" }, origin);
      const { data: linked } = await db.from("so_line_links").select("line_sub").eq("tenant_id",tenant.id).eq("user_id",ticket.user_id).maybeSingle();
      if (!linked) return reply(200, { ok: true, sent: false, reason: "CUSTOMER_NOT_LINKED" }, origin);
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "authorization": "Bearer " + channelToken, "content-type": "application/json" },
        body: JSON.stringify({ to: linked.line_sub, messages: [{ type: "text", text: tenant.name + "：現在叫到 " + number + "，請至櫃檯報到。" }] }),
      });
      if (!response.ok) return reply(502, { error: "LINE_PUSH_FAILED", status: response.status }, origin);
      return reply(200, { ok: true, sent: true }, origin);
    }
    return reply(400, { error: "UNKNOWN_ACTION" }, origin);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = ["LOGIN_REQUIRED", "INVALID_SUPABASE_SESSION", "INVALID_LINE_ID_TOKEN", "INVALID_LINE_IDENTITY"].includes(msg) ? 401 : ["LINE_LOGIN_NOT_CONFIGURED", "SUPABASE_ADMIN_NOT_CONFIGURED"].includes(msg) ? 503 : 500;
    if (status === 500) console.error("LINE integration operation failed", error instanceof Error ? error.name : "unknown");
    return reply(status, { error: status === 500 ? "INTERNAL_ERROR" : msg }, origin);
  }
});
