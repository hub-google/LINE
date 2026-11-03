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

function validUUID(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function recently(timestamp: string | null | undefined, maxMs: number): boolean {
  const t = Date.parse(timestamp || "");
  return Number.isFinite(t) && t <= Date.now() + 5_000 && Date.now() - t <= maxMs;
}
async function pushNotice(
  db: ReturnType<typeof service>,
  tenant: { id: string; name: string },
  recipient: string,
  eventKind: "CALLED" | "RESERVED" | "TICKET_CREATED",
  referenceId: string,
  message: string,
  origin: string | null,
) {
  const token = Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
  if (!token) return reply(503, { error: "LINE_MESSAGING_NOT_CONFIGURED" }, origin);
  const { data: linked, error: linkError } = await db.from("so_line_links")
    .select("line_sub,is_following").eq("tenant_id", tenant.id).eq("user_id", recipient).maybeSingle();
  if (linkError) throw linkError;
  if (!linked) return reply(200, { ok: true, sent: false, reason: "CUSTOMER_NOT_LINKED" }, origin);
  if (linked.is_following === false) return reply(200, { ok: true, sent: false, reason: "CUSTOMER_UNFOLLOWED" }, origin);

  // A single database claim per real booking/ticket event prevents duplicated push charges.
  const claim = { tenant_id: tenant.id, event_kind: eventKind, reference_id: referenceId };
  const { error: claimError } = await db.from("so_line_push_log").insert(claim);
  if (claimError?.code === "23505") return reply(200, { ok: true, sent: false, reason: "ALREADY_SENT" }, origin);
  if (claimError) throw claimError;
  const releaseClaim = async () => {
    const { error } = await db.from("so_line_push_log").delete()
      .eq("tenant_id", tenant.id).eq("event_kind", eventKind).eq("reference_id", referenceId);
    if (error) console.error("Could not release failed LINE push claim", error.code || "unknown");
  };
  let response: Response;
  try {
    response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ to: linked.line_sub, messages: [{ type: "text", text: message }] }),
    });
  } catch {
    await releaseClaim();
    return reply(502, { error: "LINE_NETWORK_ERROR" }, origin);
  }
  if (!response.ok) {
    await releaseClaim();
    // Never log the response body; it may contain internal provider information.
    return reply(502, { error: "LINE_PUSH_FAILED", status: response.status }, origin);
  }
  return reply(200, { ok: true, sent: true, note: "ACCEPTED_BY_LINE_NOT_DELIVERY_PROOF" }, origin);
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
  let payload: { events?: unknown };
  try { payload = JSON.parse(original); } catch { return reply(400, { error: "INVALID_JSON" }, origin); }
  if (!Array.isArray(payload?.events)) return reply(400, { error: "INVALID_EVENTS" }, origin);
  // Verify requests (events:[]) are accepted without touching the database.
  const events = payload.events.filter((item): item is Record<string, unknown> =>
    item !== null && typeof item === "object" &&
    (item as { type?: unknown }).type !== undefined &&
    ["follow", "unfollow"].includes(String((item as { type: unknown }).type)));
  if (!events.length) return reply(200, { ok: true }, origin);
  try {
    const db = service();
    let processed = 0;
    let duplicates = 0;
    for (const event of events) {
      const eventId = event.webhookEventId;
      const source = event.source as { type?: unknown; userId?: unknown } | undefined;
      const time = event.timestamp;
      if (typeof eventId !== "string" || !/^[a-zA-Z0-9_-]{10,100}$/.test(eventId) ||
          source?.type !== "user" || typeof source.userId !== "string" ||
          !/^U[a-f0-9]{32}$/i.test(source.userId) ||
          typeof time !== "number" || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) {
        console.warn("LINE follow event missing valid identifier or timestamp");
        continue;
      }
      const occurredAt = new Date(time).toISOString();
      // LINE resends the SAME webhookEventId; claim it before applying any side-effect.
      const { error: claimError } = await db.from("so_line_webhook_events")
        .insert({ event_id: eventId, event_type: String(event.type), occurred_at: occurredAt });
      if (claimError?.code === "23505") { duplicates++; continue; }
      if (claimError) throw claimError;
      try {
        // Event delivery may be reordered: an older event must not undo a later follow state.
        const { error: updateError } = await db.from("so_line_links")
          .update({ is_following: event.type === "follow", friendship_updated_at: occurredAt })
          .eq("line_sub", source.userId)
          .or("friendship_updated_at.is.null,friendship_updated_at.lt." + occurredAt);
        if (updateError) throw updateError;
        processed++;
      } catch (error) {
        // Release failed claims so an enabled LINE redelivery can retry.
        const { error: rollbackError } = await db.from("so_line_webhook_events").delete().eq("event_id", eventId);
        if (rollbackError) console.error("LINE webhook event claim could not be released", rollbackError.code || "unknown");
        throw error;
      }
    }
    return reply(200, { ok: true, processed, duplicates }, origin);
  } catch (error) {
    console.error("LINE webhook event handling failed", error instanceof Error ? error.name : "unknown");
    return reply(503, { error: "LINE_EVENT_PROCESSING_FAILED" }, origin);
  }
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
      const { data: previous, error: previousError } = await db.from("so_line_links")
        .select("line_sub").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      if (previousError) throw previousError;
      const link: Record<string, unknown> = { tenant_id: tenant.id, user_id: user.id, line_sub: line.sub, updated_at: new Date().toISOString() };
      if (previous && previous.line_sub !== line.sub) { link.is_following = null; link.friendship_updated_at = null; }
      const { error } = await db.from("so_line_links").upsert(link, { onConflict: "tenant_id,user_id" });
      if (error) throw error;
      const { data: linked, error: linkedError } = await db.from("so_line_links")
        .select("is_following").eq("tenant_id", tenant.id).eq("user_id", user.id).single();
      if (linkedError) throw linkedError;
      return reply(200, { ok: true, linked: true, isFollowing: linked.is_following, displayName: line.name || null }, origin);
    }

    if (payload.action === "notify") {
      const slug = String(payload.slug || "");
      const number = String(payload.number || "");
      if (!/^A\d{3,}$/.test(number) || !slug) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,name,status").eq("slug", slug).single();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: member } = await db.from("so_members").select("role")
        .eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      const { data: admin } = await db.from("so_platform_admins").select("user_id")
        .eq("user_id", user.id).maybeSingle();
      if (!member && !admin) return reply(403, { error: "STAFF_REQUIRED" }, origin);
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { data: ticket } = await db.from("so_tickets").select("id,user_id,status,updated_at")
        .eq("tenant_id", tenant.id).eq("business_date", today).eq("ticket_no", Number(number.substring(1))).maybeSingle();
      if (!ticket || ticket.status !== "CALLED" || !recently(ticket.updated_at, 90_000))
        return reply(409, { error: "TICKET_NOT_RECENTLY_CALLED" }, origin);
      return pushNotice(db, tenant, ticket.user_id, "CALLED", ticket.id,
        tenant.name + "：現在叫到 " + number + "，請至櫃檯報到。", origin);
    }
    if (payload.action === "notify-reservation") {
      const slug = String(payload.slug || "");
      if (!slug || !validUUID(payload.reservationId)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,name,status").eq("slug", slug).maybeSingle();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: booking } = await db.from("so_reservations")
        .select("id,user_id,status,created_at,booking_date,booking_time,party_size")
        .eq("id", payload.reservationId).eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      if (!booking || booking.status !== "CONFIRMED" || !recently(booking.created_at, 300_000))
        return reply(409, { error: "RESERVATION_NOT_RECENT" }, origin);
      const dateText = String(booking.booking_date);
      const timeText = String(booking.booking_time).slice(0, 5);
      return pushNotice(db, tenant, user.id, "RESERVED", booking.id,
        tenant.name + "：預約成功！" + dateText + " " + timeText + "，" + booking.party_size + " 位。請準時到店。", origin);
    }
    if (payload.action === "notify-ticket") {
      const slug = String(payload.slug || "");
      if (!slug || !validUUID(payload.ticketId)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,name,status").eq("slug", slug).maybeSingle();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: ticket } = await db.from("so_tickets")
        .select("id,user_id,status,created_at,ticket_no")
        .eq("id", payload.ticketId).eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      if (!ticket || ticket.status !== "WAITING" || !recently(ticket.created_at, 300_000))
        return reply(409, { error: "TICKET_NOT_RECENT" }, origin);
      const number = "A" + String(ticket.ticket_no).padStart(3, "0");
      return pushNotice(db, tenant, user.id, "TICKET_CREATED", ticket.id,
        tenant.name + "：取號成功！您的號碼是 " + number + "。請留意後續叫號通知。", origin);
    }
    return reply(400, { error: "UNKNOWN_ACTION" }, origin);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = ["LOGIN_REQUIRED", "INVALID_SUPABASE_SESSION", "INVALID_LINE_ID_TOKEN", "INVALID_LINE_IDENTITY"].includes(msg) ? 401 : ["LINE_LOGIN_NOT_CONFIGURED", "SUPABASE_ADMIN_NOT_CONFIGURED"].includes(msg) ? 503 : 500;
    if (status === 500) console.error("LINE integration operation failed", error instanceof Error ? error.name : "unknown");
    return reply(status, { error: status === 500 ? "INTERNAL_ERROR" : msg }, origin);
  }
});
