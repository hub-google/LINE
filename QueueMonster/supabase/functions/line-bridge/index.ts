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
type MerchantLineConfig = {
  liffId: string; channelId: string; token: string; channelSecret: string;
  botUserId: string; basicId: string; displayName: string;
};
async function merchantLineConfig(db: ReturnType<typeof service>, tenantId: string): Promise<MerchantLineConfig | null> {
  const { data, error } = await db.rpc("so_merchant_oa_read_secret", { p_tenant_id: tenantId });
  if (error) throw error;
  return data && typeof data.token === "string" && typeof data.channelId === "string"
    ? data as MerchantLineConfig : null;
}
async function lineVerify(idToken: string, accessToken?: string, options?: { channelId?: string; botToken?: string }) {
  // LINE Login ID tokens last one hour. A separate valid access token is
  // an official alternative to securely look up the same LINE user's profile.
  const liffId = Deno.env.get("LINE_LIFF_ID") || "";
  const channelId = options?.channelId || /^([0-9]{8,})-[A-Za-z0-9]+$/.exec(liffId)?.[1];
  if (!channelId) throw new Error("LINE_LOGIN_NOT_CONFIGURED");

  let idTokenFailure = "INVALID_LINE_ID_TOKEN";
  let subject = "";
  let displayName = "";

  if (idToken) {
    const form = new URLSearchParams({ id_token: idToken, client_id: channelId });
    const verified = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (verified.ok) {
      const payload = await verified.json();
      if (payload.aud !== channelId || !/^U[a-f0-9]{32}$/i.test(payload.sub || "")) {
        throw new Error("INVALID_LINE_IDENTITY");
      }
      subject = payload.sub;
      displayName = typeof payload.name === "string" ? payload.name.trim() : "";
    } else {
      const failure = await verified.json().catch(() => ({}));
      const reason = typeof failure.error_description === "string" ? failure.error_description : "";
      idTokenFailure = /audience/i.test(reason) ? "LINE_ID_TOKEN_AUDIENCE_MISMATCH" :
        /expired/i.test(reason) ? "LINE_ID_TOKEN_EXPIRED" : "INVALID_LINE_ID_TOKEN";
    }
  }

  if (accessToken) {
    // Server-side validation of LINE access token: the channel must match
    // this LIFF app and the token must be unexpired. Never trust a profile
    // or user ID supplied by the browser.
    const url = new URL("https://api.line.me/oauth2/v2.1/verify");
    url.searchParams.set("access_token", accessToken);
    const checked = await fetch(url);
    if (checked.ok) {
      const token = await checked.json();
      if (token.client_id !== channelId) throw new Error("LINE_ACCESS_TOKEN_CHANNEL_MISMATCH");
      if (!Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) <= 0) {
        throw new Error("LINE_ACCESS_TOKEN_EXPIRED");
      }
      if (typeof token.scope !== "string" || !token.scope.split(/\s+/).includes("profile")) {
        if (!subject || !displayName) throw new Error("LINE_PROFILE_SCOPE_REQUIRED");
      } else {
        const response = await fetch("https://api.line.me/v2/profile", {
          headers: { authorization: "Bearer " + accessToken },
        });
        if (response.ok) {
          const profile = await response.json();
          if (!/^U[a-f0-9]{32}$/i.test(profile.userId || "")) throw new Error("INVALID_LINE_IDENTITY");
          if (subject && subject !== profile.userId) throw new Error("LINE_PROFILE_IDENTITY_MISMATCH");
          subject = profile.userId;
          if (typeof profile.displayName === "string" && profile.displayName.trim()) {
            displayName = profile.displayName.trim();
          }
        } else if (!subject || !displayName) {
          throw new Error("LINE_PROFILE_SCOPE_REQUIRED");
        }
      }
    } else if (!subject) {
      throw new Error(idToken ? idTokenFailure : "LINE_ACCESS_TOKEN_EXPIRED");
    }
  }

  if (!subject) throw new Error(idToken ? idTokenFailure : "LINE_ACCESS_TOKEN_REQUIRED");
  // If profile scope was not granted, try retrieving the display name from
  // the official account only when this LINE user is accessible to the OA.
  if (!displayName) {
    const botToken = options?.botToken || Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
    if (botToken) {
      const response = await fetch(
        "https://api.line.me/v2/bot/profile/" + encodeURIComponent(subject),
        { headers: { authorization: "Bearer " + botToken } },
      );
      if (response.ok) {
        const profile = await response.json();
        if (profile.userId !== subject) throw new Error("LINE_PROFILE_IDENTITY_MISMATCH");
        displayName = typeof profile.displayName === "string" ? profile.displayName.trim() : "";
      }
    }
  }
  if (!displayName || displayName.length > 60) throw new Error("LINE_PROFILE_SCOPE_REQUIRED");
  return { sub: subject, name: displayName };
}

function validUUID(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function recently(timestamp: string | null | undefined, maxMs: number): boolean {
  const t = Date.parse(timestamp || "");
  return Number.isFinite(t) && t <= Date.now() + 5_000 && Date.now() - t <= maxMs;
}

type OaReachability = "REACHABLE" | "NOT_REACHABLE" | "UNKNOWN";
async function oaRecipientReachability(userId: string, overrideToken?: string): Promise<OaReachability> {
  const token = overrideToken || Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
  if (!token) return "UNKNOWN";
  try {
    const res = await fetch("https://api.line.me/v2/bot/profile/" + encodeURIComponent(userId), {
      headers: { authorization: "Bearer " + token },
    });
    if (res.ok) return "REACHABLE";
    if (res.status === 404 || res.status === 400) return "NOT_REACHABLE";
  } catch { /* Network error; never infer user is blocked. */ }
  return "UNKNOWN";
}
async function oaAddFriendUrl(overrideToken?: string): Promise<string | null> {
  const token = overrideToken || Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
  if (!token) return null;
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { authorization: "Bearer " + token },
    });
    if (!res.ok) return null;
    const info = await res.json();
    const id = typeof info.basicId === "string" ? info.basicId : "";
    return /^@[a-z0-9_.-]{2,100}$/i.test(id) ? "https://line.me/R/ti/p/" + id : null;
  } catch { return null; }
}

type ShopInfo = { id: string; slug: string; name: string; address?: string | null; phone?: string | null; liffId?: string | null };
async function shopLinkContext(db: ReturnType<typeof service>, shop: ShopInfo): Promise<ShopInfo> {
  const own = await merchantLineConfig(db, shop.id);
  return own ? { ...shop, liffId: own.liffId } : shop;
}
function liffManageLink(shop: ShopInfo, kind: "reservation" | "ticket", refId: string, mode: string): string | null {
  const id = shop.liffId || Deno.env.get("LINE_LIFF_ID") || "";
  if (!/^\d{8,}-[A-Za-z0-9]+$/.test(id)) return null;
  const query = new URLSearchParams({
    view: "customer", merchant: shop.slug, tab: "mine",
    manage: kind, item: refId, mode,
  });
  return "https://liff.line.me/" + id + "/?" + query.toString();
}
function liffQueueProgressLink(shop: ShopInfo, ticketId: string): string | null {
  const id=shop.liffId || Deno.env.get("LINE_LIFF_ID") || "";
  if (!/^\d{8,}-[A-Za-z0-9]+$/.test(id)) return null;
  const query=new URLSearchParams({
    view:"customer",merchant:shop.slug,tab:"progress",ticket:ticketId,
  });
  return "https://liff.line.me/"+id+"/?"+query.toString();
}
// Google Maps URLs work on mobile and desktop without an API key.
function googleMapsDirectionsUrl(address: string): string | null {
  const value = address.trim();
  if (!value || value.length > 300 ||
      /(?:測試用途|無實體地址|僅供測試|虛擬地址|示範地址|測試地址|尚未提供地址|未提供地址|暫無地址|請填寫地址|placeholder|test only|not a real address)/i.test(value)) {
    return null;
  }
  const uri = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(value);
  return uri.length <= 2048 ? uri : null;
}
function flexNotice(title: string, details: string[], actions: { label: string; uri?: string | null; postback?: string | null }[]): Record<string, unknown> {
  const buttons = actions.filter((a) => !!a.uri || !!a.postback);
  const rows = details.filter(Boolean);
  return {
    type: "flex",
    altText: [title, ...rows].join("｜").slice(0, 1500),
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", spacing: "md", paddingAll: "20px",
        contents: [
          { type: "text", text: title, size: "xl", weight: "bold", color: "#462B52", wrap: true },
          ...rows.flatMap((text) => {
            const address = text.startsWith("地址：") ? text.slice("地址：".length) : "";
            const mapUrl = address ? googleMapsDirectionsUrl(address) : null;
            const label = { type: "text", text, size: "sm", color: mapUrl ? "#693C8B" : "#334155", wrap: true,
              ...(mapUrl ? { action: { type: "uri", label: "Google Maps 導航", uri: mapUrl } } : {}),
            };
            return mapUrl ? [label, {
              type: "text", text: "開啟 Google Maps 導航", size: "sm", weight: "bold",
              color: "#693C8B", wrap: true,
              action: { type: "uri", label: "開啟 Google Maps 導航", uri: mapUrl },
            }] : [label];
          }),
        ],
      },
      ...(buttons.length ? { footer: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "15px",
        contents: buttons.map((button, index) => ({
          type: "button", height: "sm", style: index === 0 ? "primary" : "secondary",
          ...(index === 0 ? { color: "#693C8B" } : {}),
          action: button.postback
            ? { type: "postback", label: button.label, data: button.postback }
            : { type: "uri", label: button.label, uri: button.uri },
        })),
      } } : {}),
    },
  };
}
function shopDetails(shop: ShopInfo): string[] {
  return [
    ...(shop.address?.trim() ? ["地址：" + shop.address.trim()] : []),
    ...(shop.phone?.trim() ? ["電話：" + shop.phone.trim()] : []),
  ];
}
function ticketNumber(ticket: { ticket_no: number; number_prefix?: string | null }): string {
  // The prefix saved with the ticket remains stable when a merchant edits the default.
  return String(ticket.number_prefix ?? "") + String(ticket.ticket_no);
}
function selectedServicesText(items: unknown): string[] {
  if (!Array.isArray(items) || !items.length) return [];
  const names=items.map(x=>typeof x?.name==="string"?x.name.trim():"").filter(Boolean);
  return names.length?["已選餐點／服務：" + names.join("、").slice(0,1300)]:[];
}
// Shared ticket Flex notice used for issuance and each user-requested refresh.
async function serviceSessionNoticeLines(
  db: ReturnType<typeof service>, tenant: ShopInfo, sessionId?: string | null,
): Promise<string[]> {
  if (!sessionId) return [];
  const { data: session } = await db.from("so_service_sessions").select("name,unit_id,start_time,end_time")
    .eq("tenant_id",tenant.id).eq("id",sessionId).maybeSingle();
  if (!session) return [];
  const { data: unit } = await db.from("so_booking_resources").select("name,group_label")
    .eq("tenant_id",tenant.id).eq("id",session.unit_id).maybeSingle();
  return [
    "服務單位：" + [unit?.group_label,unit?.name].filter(Boolean).join(" · "),
    "服務場次：" + session.name + " " + String(session.start_time).slice(0,5) + "–" + String(session.end_time).slice(0,5),
  ];
}

async function ticketProgressNotice(
  db: ReturnType<typeof service>,
  tenant: ShopInfo,
  ticket: {
    id: string; status: string; ticket_no: number; number_prefix?: string | null; created_at: string;
    business_date: string; selected_items: unknown; service_session_id?: string | null; queue_joined_at?: string | null;
  },
): Promise<Record<string, unknown>> {
  const scope = (query: any) => ticket.service_session_id
    ? query.eq("service_session_id",ticket.service_session_id) : query;
  const [waitingBefore, activeCount, activeTicket, lastCalled] = await Promise.all([
    scope(db.from("so_tickets").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id).eq("business_date", ticket.business_date)
      .eq("status", "WAITING").is("deleted_at", null)
      .lt("queue_joined_at",ticket.queue_joined_at || ticket.created_at)),
    scope(db.from("so_tickets").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id).eq("business_date", ticket.business_date)
      .in("status", ["CALLED", "SERVING"]).is("deleted_at", null)),
    scope(db.from("so_tickets").select("ticket_no,number_prefix,business_date")
      .eq("tenant_id", tenant.id).eq("business_date", ticket.business_date)
      .in("status", ["CALLED", "SERVING"]).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()),
    scope(db.from("so_tickets").select("ticket_no,number_prefix,last_called_at")
      .eq("tenant_id", tenant.id).eq("business_date", ticket.business_date).is("deleted_at", null)
      .not("last_called_at", "is", null)
      .order("last_called_at", { ascending: false }).limit(1).maybeSingle()),
  ]);
  if (waitingBefore.error || activeCount.error || activeTicket.error || lastCalled.error) {
    throw new Error("QUEUE_POSITION_UNAVAILABLE");
  }
  const ahead = (waitingBefore.count ?? 0) + (activeCount.count ?? 0);
  const at = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date());
  const number = ticketNumber(ticket);
  const sessionLines=await serviceSessionNoticeLines(db,tenant,ticket.service_session_id);
  const calling = activeTicket.data
    ? "目前叫到：" + ticketNumber(activeTicket.data)
    : lastCalled.data
      ? "最近叫到：" + ticketNumber(lastCalled.data)
      : "目前尚未開始叫號";
  const statuses: Record<string, string> = {
    WAITING: "等候中", CALLED: "已叫號", SERVING: "服務中",
    COMPLETED: "已完成", CANCELLED: "已取消", PASSED: "已過號",
  };
  const position = ticket.status === "WAITING"
    ? at + " 時 前方還有 " + ahead + " 組"
    : at + " 時 您的號碼狀態：" + (statuses[ticket.status] || ticket.status);
  return flexNotice("取號成功", [
    "店家：" + tenant.name,
    "您的號碼：" + number,
    ...sessionLines,
    calling,
    position,
    ...selectedServicesText(ticket.selected_items),
    ...shopDetails(tenant),
    "叫號進度可能變動，請以最新資訊為準。",
  ], [
    { label: "查看即時叫號網頁", uri: liffQueueProgressLink(await shopLinkContext(db, tenant), ticket.id) },
    { label: "叫號進度", postback: "queue_progress:" + ticket.id },
    ...(ticket.status === "WAITING"
      ? [{ label: "取消排隊", uri: liffManageLink(await shopLinkContext(db, tenant), "ticket", ticket.id, "cancel") }]
      : []),
  ]);
}

// Both a new booking and a restored booking use this one, maintained LINE card.
async function reservationConfirmationNotice(db: ReturnType<typeof service>, tenant: ShopInfo, booking: {
  id: string; booking_date: string; booking_time: string; party_size: number; selected_items: unknown;customer_name?: string;customer_phone?: string|null;service_session_id?: string|null;
}): Promise<Record<string, unknown>> {
  const sessionLines=await serviceSessionNoticeLines(db,tenant,booking.service_session_id);
  return flexNotice("預約已成立", [
    "店家：" + tenant.name,
    "日期：" + String(booking.booking_date),
    ...sessionLines,
    "時間：" + String(booking.booking_time).slice(0, 5),
    "人數：" + booking.party_size + " 位",
    "預約姓名：" + (booking.customer_name || "未提供"),
    "聯絡電話：" + (booking.customer_phone || "未提供"),
    ...selectedServicesText(booking.selected_items),
    ...shopDetails(tenant),
    "如需調整，可使用下方按鈕。",
  ], [
    ...(booking.service_session_id ? [] : [{ label: "編輯預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "edit") }]),
    { label: "取消預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "cancel") },
  ]);
}

async function canManageRecipient(
  db: ReturnType<typeof service>, shopId: string, actor: string, recipient: string,
): Promise<boolean> {
  if (actor === recipient) return true;
  const { data: membership } = await db.from("so_members")
    .select("role").eq("tenant_id", shopId).eq("user_id", actor).maybeSingle();
  if (membership) return true;
  const { data: platform } = await db.from("so_platform_admins")
    .select("user_id").eq("user_id", actor).maybeSingle();
  if (platform) return true;
  const [a, r] = await Promise.all([
    db.from("so_line_links").select("line_sub").eq("tenant_id", shopId).eq("user_id", actor).maybeSingle(),
    db.from("so_line_links").select("line_sub").eq("tenant_id", shopId).eq("user_id", recipient).maybeSingle(),
  ]);
  return !a.error && !r.error && !!a.data?.line_sub && a.data.line_sub === r.data?.line_sub;
}
async function pushNotice(
  db: ReturnType<typeof service>,
  tenant: { id: string; name: string },
  recipient: string,
  eventKind: "CALLED" | "RESERVED" | "TICKET_CREATED" | "TICKET_CANCELLED" | "RESERVATION_CANCELLED" | "RESERVATION_UPDATED" | "RESERVATION_RESTORED" | "TICKET_RESTORED" | "QUEUE_NEAR",
  referenceId: string,
  message: string | Record<string, unknown>,
  origin: string | null,
) {
  const merchantOa = await merchantLineConfig(db, tenant.id);
  const token = merchantOa?.token || Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
  if (!token) return reply(503, { error: "LINE_MESSAGING_NOT_CONFIGURED" }, origin);
  const { data: linked, error: linkError } = await db.from("so_line_links")
    .select("line_sub,is_following").eq("tenant_id", tenant.id).eq("user_id", recipient).maybeSingle();
  if (linkError) throw linkError;
  if (!linked) return reply(200, { ok: true, sent: false, reason: "CUSTOMER_NOT_LINKED" }, origin);
  // Messaging API can accept a push without delivering it. Verify that this
  // exact OA can resolve the recipient's user ID before claiming the push.
  const reachability = await oaRecipientReachability(linked.line_sub, token);
  if (reachability === "NOT_REACHABLE") {
    return reply(200, { ok: true, sent: false, reason: "OA_CANNOT_REACH_CUSTOMER" }, origin);
  }
  if (reachability === "UNKNOWN") {
    return reply(503, { error: "OA_PROFILE_CHECK_UNAVAILABLE" }, origin);
  }

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
      body: JSON.stringify({ to: linked.line_sub, messages: [typeof message === "string" ? { type: "text", text: message } : message] }),
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

type NoticeJob = {
  id: number;
  tenant_id: string;
  event_kind: "CALLED" | "RESERVED" | "TICKET_CREATED" | "TICKET_CANCELLED" |
    "RESERVATION_CANCELLED" | "RESERVATION_UPDATED" | "RESERVATION_RESTORED" | "TICKET_RESTORED" | "QUEUE_NEAR";
  reference_id: string;
  attempts: number;
  status: string;
};
async function dispatchOutboxItem(
  db: ReturnType<typeof service>, job: NoticeJob, origin: string | null,
): Promise<{ status: "SENT" | "SKIPPED" | "RETRY"; reason?: string }> {
  const { data: tenant, error: tenantErr } = await db.from("so_tenants")
    .select("id,slug,name,status,address,phone").eq("id", job.tenant_id).maybeSingle();
  if (tenantErr) throw tenantErr;
  if (!tenant || tenant.status !== "ACTIVE") return { status: "SKIPPED", reason: "TENANT_INACTIVE" };
  let result: Response;
  if (job.event_kind === "QUEUE_NEAR") {
    const { data: ticket, error } = await db.from("so_tickets")
      .select("id,tenant_id,user_id,status,ticket_no,number_prefix,queue_near_alert_threshold")
      .eq("tenant_id", tenant.id).eq("id", job.reference_id)
      .is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!ticket || ticket.status !== "WAITING" ||
        ![3, 5].includes(Number(ticket.queue_near_alert_threshold))) {
      return { status: "SKIPPED", reason: "QUEUE_NEAR_NOT_WAITING_OR_DISABLED" };
    }
    // The minute-based scheduler is not authoritative: customer actions and
    // queue state may have changed while the notice waited in the outbox.
    const { data: readiness, error: readyError } = await db.rpc(
      "so_queue_near_alert_eligibility", { p_ticket_id: ticket.id },
    );
    if (readyError) throw readyError;
    if (!readiness?.eligible || !Number.isInteger(readiness.ahead)) {
      return { status: "SKIPPED", reason: "QUEUE_NEAR_NO_LONGER_ELIGIBLE" };
    }
    const ahead = Number(readiness.ahead);
    result = await pushNotice(db, tenant, ticket.user_id, "QUEUE_NEAR", ticket.id,
      flexNotice("快輪到您了", [
        "店家：" + tenant.name,
        "您的號碼：" + ticketNumber(ticket),
        "目前前方還有 " + ahead + " 組",
        "實際叫號順序請以門市即時進度為準。",
      ], [{
        label: "查看即時叫號網頁",
        uri: liffQueueProgressLink(await shopLinkContext(db, tenant), ticket.id),
      }]), origin);
  } else if (job.event_kind === "CALLED" || job.event_kind.startsWith("TICKET_")) {
    const isCreated = job.event_kind === "TICKET_CREATED";
    const isRestored = job.event_kind === "TICKET_RESTORED";
    const { data: ticket, error } = await db.from("so_tickets")
      .select("id,tenant_id,user_id,status,ticket_no,number_prefix,created_at,business_date,selected_items,line_call_event_id,line_cancel_event_id,line_restore_event_id")
      .eq("tenant_id", tenant.id).is("deleted_at", null)
      .eq(isCreated ? "id" : job.event_kind === "CALLED" ? "line_call_event_id" : isRestored ? "line_restore_event_id" : "line_cancel_event_id", job.reference_id)
      .maybeSingle();
    if (error) throw error;
    if (!ticket) return { status: "SKIPPED", reason: "TICKET_MISSING" };
    if (job.event_kind === "CALLED") {
      if (ticket.status !== "CALLED") return { status: "SKIPPED", reason: "CALL_SUPERSEDED" };
      result = await pushNotice(db, tenant, ticket.user_id, "CALLED", job.reference_id,
        tenant.name + "：現在叫到 " + ticketNumber(ticket) + "，請至櫃檯報到。", origin);
    } else if (isCreated) {
      if (ticket.status !== "WAITING") return { status: "SKIPPED", reason: "TICKET_NO_LONGER_WAITING" };
      result = await pushNotice(db, tenant, ticket.user_id, "TICKET_CREATED", job.reference_id,
        await ticketProgressNotice(db, tenant, ticket), origin);
    } else if(isRestored){
      if(!["WAITING","HOLD"].includes(ticket.status))return {status:"SKIPPED",reason:"TICKET_RESTORE_SUPERSEDED"};
      result=await pushNotice(db,tenant,ticket.user_id,"TICKET_RESTORED",job.reference_id,
        flexNotice("候位已恢復",[
          "店家："+tenant.name,
          "號碼："+ticketNumber(ticket),
          "目前狀態："+(ticket.status==="HOLD"?"保留中":"候位中"),
          "此號碼已從取消狀態恢復，請依即時叫號網頁確認最新排序。",
          ...shopDetails(tenant),
        ],[{label:"查看即時叫號網頁",uri:liffQueueProgressLink(await shopLinkContext(db,tenant),ticket.id)}]),origin);
    } else {
      if (ticket.status !== "CANCELLED") return { status: "SKIPPED", reason: "TICKET_NOT_CANCELLED" };
      result = await pushNotice(db, tenant, ticket.user_id, "TICKET_CANCELLED", job.reference_id,
        flexNotice("已取消排隊", [
          "店家：" + tenant.name,
          "取消號碼：" + ticketNumber(ticket),
          "此號碼已不在候位名單中。",
          ...shopDetails(tenant),
        ], [{ label: "查看我的紀錄", uri: liffManageLink(await shopLinkContext(db, tenant), "ticket", ticket.id, "view") }]), origin);
    }
  } else {
    const field = job.event_kind === "RESERVED" ? "id"
      : job.event_kind === "RESERVATION_RESTORED" ? "line_restore_event_id"
      : job.event_kind === "RESERVATION_CANCELLED" ? "line_cancel_event_id"
      : "line_update_event_id";
    const { data: booking, error } = await db.from("so_reservations")
      .select("id,user_id,status,booking_date,booking_time,party_size,customer_name,customer_phone,selected_items,service_session_id,line_restore_event_id,line_cancel_event_id,line_update_event_id")
      .eq("tenant_id", tenant.id).is("deleted_at", null).eq(field, job.reference_id).maybeSingle();
    if (error) throw error;
    if (!booking) return { status: "SKIPPED", reason: "BOOKING_MISSING" };
    if (job.event_kind === "RESERVATION_CANCELLED") {
      if (booking.status !== "CANCELLED") return { status: "SKIPPED", reason: "BOOKING_RESTORED" };
      result = await pushNotice(db, tenant, booking.user_id, "RESERVATION_CANCELLED", job.reference_id,
        flexNotice("預約已取消", [
          "店家：" + tenant.name, "日期：" + booking.booking_date,
          "時間：" + String(booking.booking_time).slice(0, 5),
          "人數：" + booking.party_size + " 位",
          "預約姓名：" + (booking.customer_name || "未提供"),
          "聯絡電話：" + (booking.customer_phone || "未提供"),
          ...selectedServicesText(booking.selected_items), ...shopDetails(tenant),
        ], [{ label: "查看我的紀錄", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "view") }]), origin);
    } else {
      if (booking.status !== "CONFIRMED") return { status: "SKIPPED", reason: "BOOKING_NOT_CONFIRMED" };
      const isNew = job.event_kind === "RESERVED" || job.event_kind === "RESERVATION_RESTORED";
      result = await pushNotice(db, tenant, booking.user_id, job.event_kind, job.reference_id,
        isNew ? await reservationConfirmationNotice(db, tenant, booking)
          : flexNotice("預約已更新", [
              "店家：" + tenant.name, "日期：" + booking.booking_date,
              "時間：" + String(booking.booking_time).slice(0, 5),
              "人數：" + booking.party_size + " 位",
              "預約姓名：" + (booking.customer_name || "未提供"),
              "聯絡電話：" + (booking.customer_phone || "未提供"),
              ...selectedServicesText(booking.selected_items), ...shopDetails(tenant),
            ], [
              { label: "編輯預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "edit") },
              { label: "取消預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "cancel") },
            ]), origin);
    }
  }
  const data = await result.json().catch(() => ({}));
  if (result.ok && (data.sent === true || data.reason === "ALREADY_SENT")) return { status: "SENT" };
  return { status: "RETRY", reason: String(data.reason || data.error || "DELIVERY_FAILED").slice(0, 150) };
}
async function dispatchPendingNotices(req: Request, origin: string | null): Promise<Response> {
  const db = service();
  const { data: secret, error: secretError } = await db.from("so_line_worker_keys")
    .select("secret").eq("name", "notices").maybeSingle();
  if (secretError || !secret?.secret) return reply(503, { error: "WORKER_KEY_UNAVAILABLE" }, origin);
  const sentKey = req.headers.get("x-line-worker-key") || "";
  // Constant-time comparison for credentials of the expected length.
  const expected = new TextEncoder().encode(secret.secret);
  const actual = new TextEncoder().encode(sentKey);
  let mismatch = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ (actual[i] ?? 0);
  if (mismatch !== 0) return reply(403, { error: "WORKER_UNAUTHORIZED" }, origin);
  const { data: due, error: dueError } = await db.from("so_line_notice_outbox")
    .select("id,tenant_id,event_kind,reference_id,status,attempts")
    .in("status", ["PENDING", "RETRY"])
    .lte("next_attempt_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(20);
  if (dueError) throw dueError;
  let sent = 0, deferred = 0, skipped = 0;
  for (const candidate of due || []) {
    const { data: claimed, error: claimError } = await db.from("so_line_notice_outbox")
      .update({ status: "PROCESSING", processing_at: new Date().toISOString(), attempts: candidate.attempts + 1 })
      .eq("id", candidate.id).eq("status", candidate.status)
      .select("id,tenant_id,event_kind,reference_id,attempts,status").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    let status: "SENT" | "SKIPPED" | "RETRY" = "RETRY";
    let reason = "";
    try {
      const result = await dispatchOutboxItem(db, claimed as NoticeJob, origin);
      status = result.status;
      reason = result.reason || "";
    } catch (error) {
      // Do not write tokens or payload bodies into a log.
      reason = error instanceof Error ? error.name : "DELIVERY_EXCEPTION";
    }
    const retryMinutes = Math.min(360, Math.max(1, 2 ** Math.min(claimed.attempts, 8)));
    const expired = claimed.attempts >= 14;
    const next = status === "RETRY" && expired ? "FAILED" : status === "RETRY" ? "RETRY" : status;
    const { error: finishedError } = await db.from("so_line_notice_outbox").update({
      status: next, processing_at: null,
      last_error: reason || null,
      sent_at: next === "SENT" ? new Date().toISOString() : null,
      next_attempt_at: next === "RETRY" ? new Date(Date.now() + retryMinutes * 60000).toISOString() : new Date().toISOString(),
    }).eq("id", candidate.id).eq("status", "PROCESSING");
    if (finishedError) throw finishedError;
    if (next === "SENT") sent++;
    else if (next === "SKIPPED") skipped++;
    else deferred++;
  }
  return reply(200, { ok: true, inspected: due?.length || 0, sent, deferred, skipped }, origin);
}

// Platform-wide OA replies are navigation only. All private operations still
// require verified LINE identity and tenant-scoped RPCs on the website.
const PLATFORM_ENTRY = "https://hub-google.github.io/LINE/booking/";
function platformBotMessage(command: string, welcome = false): Record<string, unknown> {
  const input = command.trim().toLowerCase().slice(0, 120);
  let title = "排隊怪獸｜請選擇要使用的服務";
  let link = PLATFORM_ENTRY+"directory.html?mode=search";
  let label = "找店家預約";
  if (welcome) {
    title = "歡迎加入排隊怪獸！可以搜尋不同店家、線上預約、現場取號，也能查看自己的預約和號碼。需要操作時再驗證 LINE 身分，不用另外註冊網站帳密。";
  } else if (!/客服|協助|幫助|問題|聯絡|人工/.test(input) && /商家|店家開通|申請開通|店員|管理後台|後台/.test(input)) {
    title = "商家可申請開通門市，已有帳號的店員請進入管理後台。";
    link = PLATFORM_ENTRY+"merchant-register.html";
    label = "申請商家開通";
  } else if (/客服|協助|幫助|問題|聯絡|人工/.test(input)) {
    title = "需要協助嗎？請先查看操作說明。若需要人工協助，請在此聊天室留言問題、操作時間與畫面；勿傳送密碼、Channel Secret 或 Access Token。是否能即時人工回覆依平台客服服務時間為準。";
    link = PLATFORM_ENTRY+"merchant-center.html#guide";
    label = "操作教學";
  } else if (/遊戲|逛街|探索/.test(input)) {
    title = "開啟遊戲逛街模式，探索公開店家。";
    link = PLATFORM_ENTRY+"directory.html?mode=game";
    label = "遊戲逛街";
  } else if (/我的|紀錄|紀錄查詢|歷史|取消|修改/.test(input)) {
    title = "個人紀錄需完成 LINE 身分驗證，才能查看跨店預約與取號。";
    link = PLATFORM_ENTRY+"directory.html?mode=mine";
    label = "我的紀錄";
  } else if (/叫號|看板|進度|輪到|排到/.test(input)) {
    title = "先找到你的店家，再查看所屬門市的叫號看板；個人進度以自己的號碼紀錄為準。";
    link = PLATFORM_ENTRY+"directory.html?mode=queue";
    label = "尋找叫號看板";
  } else if (/取號|抽號|排隊|候位|領號/.test(input)) {
    title = "選擇店家後即可進行現場取號，取號前會驗證 LINE 身分。";
    link = PLATFORM_ENTRY+"directory.html?mode=queue";
    label = "現場取號";
  } else if (/預約|找店|訂位|掛號/.test(input)) {
    title = "先搜尋店家，選擇服務或場次後即可進行預約。";
  }
  return {
    type: "text",
    text: title+"\n"+link,
    quickReply: {
      items: [
        {type:"action",action:{type:"uri",label,uri:link}},
        {type:"action",action:{type:"uri",label:"我的紀錄",uri:PLATFORM_ENTRY+"directory.html?mode=mine"}},
        {type:"action",action:{type:"uri",label:"現場取號",uri:PLATFORM_ENTRY+"directory.html?mode=queue"}},
      ],
    },
  };
}
async function replyToLine(token: string, replyToken: string,
                           message: Record<string, unknown>, redelivery = false): Promise<boolean> {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method:"POST",
    headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({replyToken,messages:[message]}),
  });
  if (response.ok) return true;
  // LINE reply tokens are one-use. A redelivery after a valid first reply
  // can return 400; never create a new push message in this case.
  if (response.status===400 && redelivery) return false;
  throw new Error("LINE_REPLY_FAILED_"+response.status);
}

async function webhook(req: Request, origin: string | null, merchantSlug = "") {
  let merchantTenantId: string | null = null;
  let ownOa: MerchantLineConfig | null = null;
  if (merchantSlug) {
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(merchantSlug))
      return reply(400, {error:"INVALID_MERCHANT"}, origin);
    const db = service();
    const { data: tenant } = await db.from("so_tenants")
      .select("id").eq("slug", merchantSlug).eq("status", "ACTIVE").maybeSingle();
    if (!tenant) return reply(404, {error:"TENANT_NOT_FOUND"}, origin);
    merchantTenantId = tenant.id;
    ownOa = await merchantLineConfig(db, tenant.id);
    if (!ownOa) return reply(404, {error:"MERCHANT_OA_NOT_CONNECTED"}, origin);
  }
  const secret = ownOa?.channelSecret || Deno.env.get("LINE_MESSAGING_CHANNEL_SECRET");
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
    ["follow", "unfollow", "postback", "message"].includes(String((item as { type: unknown }).type)));
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
      if (event.type === "message") {
        // Do not take over a connected merchant's own OA conversation.
        if (merchantTenantId) continue;
        const message = event.message as { type?: unknown; text?: unknown } | undefined;
        const replyToken = event.replyToken;
        if (message?.type !== "text" || typeof message.text !== "string" ||
            typeof replyToken !== "string" || !replyToken || replyToken.length>512) continue;
        const token = Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
        if (!token) throw new Error("LINE_MESSAGING_NOT_CONFIGURED");
        const redelivery=(event.deliveryContext as {isRedelivery?:unknown}|undefined)?.isRedelivery===true;
        // The platform OA accepts an explicit opt-in; it never broadcasts
        // FoodRadar reports to all unrelated QueueMonster customers.
        const normalized=message.text.trim().replace(/\\s+/g,"").toLowerCase();
        const subscribe=["訂閱foodradar","foodradar訂閱","訂閱商品日報"].includes(normalized);
        const unsubscribe=["取消foodradar訂閱","取消訂閱foodradar","取消商品日報"].includes(normalized);
        if (subscribe || unsubscribe) {
          const { error: updateError }=subscribe
            ? await db.from("foodradar_line_subscriptions").upsert({
                line_user_id:source.userId, enabled:true, updated_at:new Date().toISOString(),
              }, {onConflict:"line_user_id"})
            : await db.from("foodradar_line_subscriptions").update({
                enabled:false, updated_at:new Date().toISOString(),
              }).eq("line_user_id",source.userId);
          if (updateError) throw updateError;
          const notice=subscribe
            ? "已訂閱 FoodRadar 每日商品資料完整性報告。每天早上會收到最近一次三軌查核結果；若原站網頁遭驗證阻擋，會如實標示未驗證。傳送「取消FoodRadar訂閱」可停止通知。"
            : "已取消 FoodRadar 每日資料完整性報告。如需重新訂閱，請傳送「訂閱FoodRadar」。";
          const sent=await replyToLine(token,replyToken,{type:"text",text:notice},redelivery);
          if (sent) processed++; else duplicates++;
          continue;
        }
        const sent=await replyToLine(token,replyToken,platformBotMessage(message.text),redelivery);
        if (sent) processed++; else duplicates++;
        continue;
      }
      if (event.type === "postback") {
        const postback = event.postback as { data?: unknown } | undefined;
        const command = typeof postback?.data === "string" ? postback.data : "";
        const ticketId = command.startsWith("queue_progress:") ? command.slice("queue_progress:".length) : "";
        const replyToken = event.replyToken;
        if (!validUUID(ticketId) || typeof replyToken !== "string" ||
            !replyToken || replyToken.length > 512) continue;
        const { data: ticket, error: ticketError } = await db.from("so_tickets")
          .select("id,tenant_id,user_id,status,ticket_no,number_prefix,created_at,business_date,selected_items")
          .eq("id", ticketId).is("deleted_at", null).maybeSingle();
        if (ticketError) throw ticketError;
        let notice: Record<string, unknown> = {
          type: "text", text: "這張號碼目前無法查詢，請返回門市叫號網頁查看。",
        };
        if (ticket && (!merchantTenantId || ticket.tenant_id === merchantTenantId)) {
          // A signed LINE event identifies the person, but a ticket ID is
          // never authority: match both tenant and linked ticket owner.
          const [linkResult, tenantResult] = await Promise.all([
            db.from("so_line_links").select("user_id")
              .eq("tenant_id", ticket.tenant_id).eq("user_id", ticket.user_id)
              .eq("line_sub", source.userId).limit(1),
            db.from("so_tenants").select("id,slug,name,status,address,phone")
              .eq("id", ticket.tenant_id).eq("status", "ACTIVE").maybeSingle(),
          ]);
          if (linkResult.error) throw linkResult.error;
          if (tenantResult.error) throw tenantResult.error;
          if (linkResult.data?.length && tenantResult.data) {
            notice = await ticketProgressNotice(db, tenantResult.data, ticket);
          }
        }
        const token = ownOa?.token || Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
        if (!token) throw new Error("LINE_MESSAGING_NOT_CONFIGURED");
        const response = await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: { authorization: "Bearer " + token, "content-type": "application/json" },
          body: JSON.stringify({ replyToken, messages: [notice] }),
        });
        if (!response.ok) {
          // Reply tokens are single use; avoid an infinite LINE redelivery
          // cycle after a successful first response.
          const context = event.deliveryContext as { isRedelivery?: unknown } | undefined;
          if (response.status === 400 && context?.isRedelivery === true) {
            duplicates++;
            continue;
          }
          throw new Error("LINE_REPLY_FAILED_" + response.status);
        }
        processed++;
        continue;
      }

      const occurredAt = new Date(time).toISOString();
      // PostgreSQL atomically records this ID AND updates friendship state.
      // A crash cannot leave a claimed but unprocessed event.
      const { data: outcome, error: applyError } = merchantTenantId
        ? await db.rpc("so_apply_merchant_oa_friend_event", {
          p_tenant_id:merchantTenantId, p_event_id:eventId,
          p_event_type:String(event.type),p_line_sub:source.userId,p_occurred_at:occurredAt,
        })
        : await db.rpc("so_apply_line_webhook_friend_event", {
          p_event_id:eventId,p_event_type:String(event.type),
          p_line_sub:source.userId,p_occurred_at:occurredAt,
        });
      if (applyError) throw applyError;
      if (outcome === "DUPLICATE") duplicates++;
      else if (outcome === "PROCESSED") {
        processed++;
        // Never send platform branding to a merchant-owned OA.
        // Avoid duplicate greetings: only reply on the first processed follow.
        if (event.type === "follow" && !merchantTenantId &&
            Deno.env.get("LINE_PLATFORM_WELCOME_REPLY")==="true") {
          const token=Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
          const replyToken=event.replyToken;
          if (token && typeof replyToken==="string" && replyToken.length<=512) {
            try {
              await replyToLine(token,replyToken,platformBotMessage("",true),
                (event.deliveryContext as {isRedelivery?:unknown}|undefined)?.isRedelivery===true);
            } catch (cause) {
              // The friendship event has been recorded; a failed greeting must
              // not reset friend state or make LINE retry the whole event.
              console.warn("Platform OA welcome reply failed",
                cause instanceof Error ? cause.name : "unknown");
            }
          }
        }
      } else throw new Error("UNEXPECTED_LINE_EVENT_RESULT");
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
  if (url.searchParams.get("action") === "foodradar-subscribers") {
    if (req.method !== "GET") return reply(405,{error:"METHOD_NOT_ALLOWED"},origin);
    const token=Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN");
    const day=req.headers.get("x-foodradar-date") || "";
    const provided=req.headers.get("x-foodradar-signature") || "";
    const validDay=/^\\d{4}-\\d{2}-\\d{2}$/.test(day)
      && Number.isFinite(Date.parse(day+"T00:00:00+08:00"))
      && Math.abs(Date.now()-Date.parse(day+"T00:00:00+08:00")) < 36*60*60*1000;
    if (!token || !validDay || !/^[a-f0-9]{64}$/.test(provided)) {
      return reply(401,{error:"UNAUTHORIZED"},origin);
    }
    const encoder=new TextEncoder();
    const hmacKey=await crypto.subtle.importKey("raw",encoder.encode(token),
      {name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign(
      "HMAC",hmacKey,encoder.encode("foodradar-subscribers:"+day))))
      .map((v)=>v.toString(16).padStart(2,"0")).join("");
    let mismatch=0;
    for (let i=0;i<64;i++) mismatch |= signature.charCodeAt(i)^provided.charCodeAt(i);
    if (mismatch) return reply(401,{error:"UNAUTHORIZED"},origin);
    try {
      const db=service();
      const {data,error}=await db.from("foodradar_line_subscriptions")
        .select("line_user_id").eq("enabled",true).limit(100);
      if (error) throw error;
      // LINE IDs are private: no CORS header and no server-side logging.
      return new Response(JSON.stringify({recipients:(data || []).map(
        (r:{line_user_id:string})=>r.line_user_id)}),
        {status:200,headers:{"content-type":"application/json",
                             "cache-control":"no-store"}});
    } catch {
      return reply(503,{error:"SUBSCRIPTION_LOOKUP_UNAVAILABLE"},origin);
    }
  }
  if (url.searchParams.get("action") === "webhook") {
    if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);
    return webhook(req, origin, url.searchParams.get("merchant") || "");
  }
  if (url.searchParams.get("action") === "dispatch-pending") {
    if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);
    try { return await dispatchPendingNotices(req, origin); }
    catch (error) {
      console.error("LINE outbox dispatcher failed", error instanceof Error ? error.name : "unknown");
      return reply(503, { error: "DISPATCH_UNAVAILABLE" }, origin);
    }
  }
  if (req.method === "GET" && url.searchParams.get("action") === "config") {
    const merchant = url.searchParams.get("merchant") || "";
    let own: { liff_id: string; bot_basic_id: string | null } | null = null;
    if (/^[a-z0-9][a-z0-9-]{2,39}$/.test(merchant)) {
      const db = service();
      const { data: tenant } = await db.from("so_tenants").select("id").eq("slug", merchant).eq("status", "ACTIVE").maybeSingle();
      if (tenant) {
        const { data: config } = await db.from("so_line_merchant_oas")
          .select("liff_id,bot_basic_id").eq("tenant_id", tenant.id).eq("status", "ACTIVE").maybeSingle();
        own = config;
      }
    }
    const liffId = own?.liff_id || Deno.env.get("LINE_LIFF_ID") || "";
    const expectedChannelId = /^([0-9]{8,})-[A-Za-z0-9]+$/.exec(liffId)?.[1] || null;
    return reply(200, {
      liffId: liffId || null, merchantOaConnected: !!own,
      botBasicId: own?.bot_basic_id || null,
      loginReady: !!expectedChannelId,
      messagingReady: !!own || !!Deno.env.get("LINE_MESSAGING_ACCESS_TOKEN"),
      loginChannelMatchesLiff: !!expectedChannelId &&
        (!!own || expectedChannelId === Deno.env.get("LINE_LOGIN_CHANNEL_ID")),
    }, origin);
  }
  if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" }, origin);
  if (origin && origin !== originAllowed) return reply(403, { error: "ORIGIN_DENIED" }, origin);
  try {
    const payload = await req.json();
    const db = service();
    const user = await identity(req, db);
    if (payload.action === "connect-merchant-oa" || payload.action === "disconnect-merchant-oa") {
      const slug = String(payload.slug || "");
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants")
        .select("id,slug,status").eq("slug",slug).eq("status","ACTIVE").maybeSingle();
      if (!tenant) return reply(404, { error:"TENANT_NOT_FOUND" }, origin);
      const { data: member } = await db.from("so_members")
        .select("role").eq("tenant_id",tenant.id).eq("user_id",user.id).maybeSingle();
      const { data: platform } = await db.from("so_platform_admins")
        .select("user_id").eq("user_id",user.id).maybeSingle();
      if (!["OWNER","MANAGER"].includes(member?.role || "") && !platform)
        return reply(403,{error:"MANAGER_REQUIRED"},origin);
      if (payload.action === "disconnect-merchant-oa") {
        const { error } = await db.rpc("so_merchant_oa_disconnect", {
          p_tenant_id:tenant.id,p_actor:user.id
        });
        if (error) throw error;
        return reply(200,{ok:true,disconnected:true},origin);
      }
      const liffId = typeof payload.liffId === "string" ? payload.liffId.trim() : "";
      const botToken = typeof payload.botToken === "string" ? payload.botToken.trim() : "";
      const channelSecret = typeof payload.channelSecret === "string" ? payload.channelSecret.trim() : "";
      if (!/^\d{8,}-[A-Za-z0-9]+$/.test(liffId) ||
          botToken.length<32 || botToken.length>4096 ||
          !/^[0-9a-f]{32}$/i.test(channelSecret))
        return reply(400,{error:"LINE_CHANNEL_FIELDS_INVALID"},origin);
      const verified = await fetch("https://api.line.me/v2/bot/info", {
        headers:{authorization:"Bearer "+botToken}
      });
      if (!verified.ok) return reply(400,{error:"LINE_BOT_TOKEN_INVALID"},origin);
      const bot = await verified.json();
      if (!/^U[0-9a-f]{32}$/i.test(String(bot.userId||"")))
        return reply(400,{error:"LINE_BOT_PROFILE_INVALID"},origin);
      const { error } = await db.rpc("so_merchant_oa_save_secret",{
        p_tenant_id:tenant.id,p_liff_id:liffId,
        p_bot_user_id:bot.userId,p_basic_id:String(bot.basicId||""),
        p_display_name:String(bot.displayName||""),
        p_token:botToken,p_channel_secret:channelSecret,p_actor:user.id,
      });
      if (error) throw error;
      return reply(200,{
        ok:true, connected:true, displayName:String(bot.displayName||""),
        basicId:String(bot.basicId||""), liffId,
        webhookUrl:"https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=webhook&merchant="+encodeURIComponent(slug),
        note:"LINE Login and Messaging API channels must share a Provider",
      },origin);
    }
    // Returning customers keep their browser's refreshable Supabase session.
    // A previously LINE-verified identity may be resumed for 30 days without
    // re-running LIFF/OAuth. The browser never supplies a LINE user ID.
    if (payload.action === "resume") {
      const slug = String(payload.slug || "");
      if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant, error: tenantError } = await db.from("so_tenants")
        .select("id").eq("slug", slug).eq("status", "ACTIVE").maybeSingle();
      if (tenantError) throw tenantError;
      if (!tenant) return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const ownOa = await merchantLineConfig(db, tenant.id);
      const expectedChannelId = ownOa?.channelId ||
        /^([0-9]{8,})-[A-Za-z0-9]+$/.exec(Deno.env.get("LINE_LIFF_ID") || "")?.[1] || "";
      const { data: linked, error: linkError } = await db.from("so_line_links")
        .select("display_name,is_following,updated_at,login_channel_id")
        .eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      if (linkError) throw linkError;
      const verifiedAt = Date.parse(String(linked?.updated_at || ""));
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      if (!linked?.display_name?.trim() || linked.login_channel_id !== expectedChannelId || !Number.isFinite(verifiedAt) ||
          verifiedAt > Date.now() + 60000 || Date.now() - verifiedAt > maxAge) {
        return reply(401, { error: "LINE_REAUTH_REQUIRED" }, origin);
      }
      return reply(200, {
        ok: true, linked: true, displayName: linked.display_name,
        isFollowing: linked.is_following, recipientReachability: "UNKNOWN",
        friendCheckStatus: "CACHED_SESSION",
      }, origin);
    }
    if (payload.action === "link") {
      const slug = String(payload.slug || "");
      const idToken = String(payload.idToken || "");
      if (!slug || idToken.length > 10000) return reply(400, { error: "BAD_REQUEST" }, origin);
      const accessToken = typeof payload.accessToken === "string" && payload.accessToken.length <= 10000
        ? payload.accessToken : undefined;
      if (!idToken && !accessToken) return reply(400, { error: "LINE_LOGIN_TOKEN_REQUIRED" }, origin);
      const { data: tenant, error: te } = await db.from("so_tenants")
        .select("id,slug,status").eq("slug", slug).eq("status", "ACTIVE").single();
      if (te || !tenant) return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const ownOa = await merchantLineConfig(db, tenant.id);
      const expectedChannelId = ownOa?.channelId ||
        /^([0-9]{8,})-[A-Za-z0-9]+$/.exec(Deno.env.get("LINE_LIFF_ID") || "")?.[1] || "";
      const line = await lineVerify(idToken, accessToken, {
        channelId:expectedChannelId, botToken:ownOa?.token
      });
      // LINE Login friendship checks often fail when the Login channel has
      // no linked OA. Always independently test the actual Messaging OA.
      let verifiedFriendship: boolean | null = null;
      let friendCheckStatus = "UNAVAILABLE";
      if (accessToken) {
        try {
          const friendship = await fetch("https://api.line.me/friendship/v1/status", {
            headers: { authorization: "Bearer " + accessToken },
          });
          if (friendship.ok) {
            const result = await friendship.json();
            if (typeof result.friendFlag === "boolean") {
              verifiedFriendship = result.friendFlag;
              friendCheckStatus = "VERIFIED";
            }
          } else if (friendship.status === 400) {
            friendCheckStatus = "LINK_OR_SCOPE_CONFIGURATION";
          } else if (friendship.status === 401 || friendship.status === 403) {
            friendCheckStatus = "TOKEN_OR_PROFILE_SCOPE";
          }
        } catch { friendCheckStatus = "LINE_API_UNAVAILABLE"; }
      }
      const [recipientReachability, addFriendUrl] = await Promise.all([
        oaRecipientReachability(line.sub,ownOa?.token),
        oaAddFriendUrl(ownOa?.token),
      ]);
      const { data: previous, error: previousError } = await db.from("so_line_links")
        .select("line_sub,login_channel_id").eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      if (previousError) throw previousError;
      const link: Record<string, unknown> = { tenant_id: tenant.id, user_id: user.id,
        line_sub: line.sub, login_channel_id: expectedChannelId, updated_at: new Date().toISOString() };
      if (previous && (previous.line_sub !== line.sub || previous.login_channel_id !== expectedChannelId))
        return reply(409, { error: "LINE_ACCOUNT_CHANGED" }, origin);
      link.display_name = line.name;
      // A LINE Login channel can be linked to a different OA. Never turn
      // that channel's friendFlag into proof this Messaging OA can message.
      if (verifiedFriendship !== null && recipientReachability === "REACHABLE") {
        link.is_following = verifiedFriendship;
        link.friendship_updated_at = new Date().toISOString();
      } else if (recipientReachability === "NOT_REACHABLE") {
        link.is_following = null;
        link.friendship_updated_at = null;
      }
      const { error } = await db.from("so_line_links").upsert(link, { onConflict: "tenant_id,user_id" });
      if (error) throw error;
      const { data: linked, error: linkedError } = await db.from("so_line_links")
        .select("is_following").eq("tenant_id", tenant.id).eq("user_id", user.id).single();
      if (linkedError) throw linkedError;
      return reply(200, {
        ok: true, linked: true, isFollowing: linked.is_following,
        displayName: line.name || null, recipientReachability,
        friendCheckStatus,
        oaAddFriendUrl: addFriendUrl,
        providerMismatchSuspected: verifiedFriendship === true && recipientReachability === "NOT_REACHABLE",
      }, origin);
    }

    if (payload.action === "notify") {
      const slug = String(payload.slug || "");
      const number = String(payload.number || "");
      if (number.length > 40 || !slug) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,name,status").eq("slug", slug).single();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: member } = await db.from("so_members").select("role")
        .eq("tenant_id", tenant.id).eq("user_id", user.id).maybeSingle();
      const { data: admin } = await db.from("so_platform_admins").select("user_id")
        .eq("user_id", user.id).maybeSingle();
      if (!member && !admin) return reply(403, { error: "STAFF_REQUIRED" }, origin);
      // Ticket UUID is authoritative; ticket numbers can repeat across calendar dates.
      const ticketId = String(payload.ticketId || "");
      const eventId = String(payload.eventId || "");
      if (!validUUID(ticketId) || !validUUID(eventId))
        return reply(400, { error: "CALL_EVENT_ID_REQUIRED" }, origin);
      const { data: ticket } = await db.from("so_tickets")
        .select("id,user_id,status,updated_at,ticket_no,number_prefix,line_call_event_id")
        .eq("tenant_id", tenant.id).eq("id", ticketId).is("deleted_at", null).maybeSingle();
      if (!ticket || ticket.status !== "CALLED" || ticket.line_call_event_id !== eventId ||
          !recently(ticket.updated_at, 90_000))
        return reply(409, { error: "CALL_EVENT_EXPIRED_OR_SUPERSEDED" }, origin);
      const actualNumber = ticketNumber(ticket);
      // Read the display number from the verified ticket UUID and event, not the browser.
      return pushNotice(db, tenant, ticket.user_id, "CALLED", eventId,
        tenant.name + "：現在叫到 " + actualNumber + "，請至櫃檯報到。", origin);
    }
    if (payload.action === "notify-reservation" || payload.action === "notify-reservation-restored") {
      const restored = payload.action === "notify-reservation-restored";
      const slug = String(payload.slug || "");
      if (!slug || !validUUID(payload.reservationId)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,slug,name,status,address,phone").eq("slug", slug).maybeSingle();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: booking } = await db.from("so_reservations")
        .select("id,user_id,status,created_at,booking_date,booking_time,party_size,customer_name,customer_phone,selected_items,service_session_id,line_restore_event_id")
        .eq("id", payload.reservationId).eq("tenant_id", tenant.id).is("deleted_at", null).maybeSingle();
      if (!booking || booking.status !== "CONFIRMED")
        return reply(409, { error: "RESERVATION_NOT_CONFIRMED" }, origin);
      if (restored) {
        // Only a CANCELLED -> CONFIRMED transition stamps this id in the database.
        if (!booking.line_restore_event_id) return reply(409, { error: "RESERVATION_NOT_RESTORED" }, origin);
        if (!await canManageRecipient(db, tenant.id, user.id, booking.user_id))
          return reply(403, { error: "NOT_AUTHORIZED" }, origin);
      } else if (booking.user_id !== user.id || !recently(booking.created_at, 300_000)) {
        return reply(409, { error: "RESERVATION_NOT_RECENT" }, origin);
      }
      return pushNotice(db, tenant, booking.user_id,
        restored ? "RESERVATION_RESTORED" : "RESERVED",
        restored ? booking.line_restore_event_id! : booking.id,
        await reservationConfirmationNotice(db, tenant, booking), origin);
    }
    if (payload.action === "notify-ticket") {
      const slug = String(payload.slug || "");
      if (!slug || !validUUID(payload.ticketId)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants").select("id,slug,name,status,address,phone").eq("slug", slug).maybeSingle();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      const { data: ticket } = await db.from("so_tickets")
        .select("id,user_id,status,created_at,ticket_no,number_prefix,business_date,selected_items,service_session_id,queue_joined_at")
        .eq("id", payload.ticketId).eq("tenant_id", tenant.id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
      if (!ticket || ticket.status !== "WAITING" || !recently(ticket.created_at, 300_000))
        return reply(409, { error: "TICKET_NOT_RECENT" }, origin);
      return pushNotice(db, tenant, user.id, "TICKET_CREATED", ticket.id,
        await ticketProgressNotice(db, tenant, ticket), origin);
    }

    if(payload.action==="notify-ticket-restored"){
      const slug=String(payload.slug||""),ticketId=String(payload.ticketId||""),eventId=String(payload.eventId||"");
      if(!slug||!validUUID(ticketId)||!validUUID(eventId))return reply(400,{error:"INVALID_RESTORE_EVENT"},origin);
      const {data:tenant}=await db.from("so_tenants").select("id,slug,name,status,address,phone").eq("slug",slug).maybeSingle();
      if(!tenant||tenant.status!=="ACTIVE")return reply(404,{error:"TENANT_NOT_FOUND"},origin);
      const {data:ticket}=await db.from("so_tickets")
        .select("id,user_id,status,ticket_no,number_prefix,line_restore_event_id")
        .eq("id",ticketId).eq("tenant_id",tenant.id).is("deleted_at",null).maybeSingle();
      if(!ticket||!["WAITING","HOLD"].includes(ticket.status)||ticket.line_restore_event_id!==eventId)
        return reply(409,{error:"TICKET_NOT_RESTORED_OR_SUPERSEDED"},origin);
      if(!await canManageRecipient(db,tenant.id,user.id,ticket.user_id))
        return reply(403,{error:"NOT_AUTHORIZED"},origin);
      return pushNotice(db,tenant,ticket.user_id,"TICKET_RESTORED",eventId,
        flexNotice("候位已恢復",[
          "店家："+tenant.name,
          "號碼："+ticketNumber(ticket),
          "目前狀態："+(ticket.status==="HOLD"?"保留中":"候位中"),
          "此號碼已從取消狀態恢復，請依即時叫號網頁確認最新排序。",
          ...shopDetails(tenant),
        ],[{label:"查看即時叫號網頁",uri:liffQueueProgressLink(await shopLinkContext(db,tenant),ticket.id)}]),origin);
    }
    if (payload.action === "notify-ticket-cancel" || payload.action === "notify-reservation-cancel" || payload.action === "notify-reservation-updated") {
      const slug = String(payload.slug || "");
      const isTicket = payload.action === "notify-ticket-cancel";
      const refId = isTicket ? payload.ticketId : payload.reservationId;
      if (!slug || !validUUID(refId)) return reply(400, { error: "BAD_REQUEST" }, origin);
      const { data: tenant } = await db.from("so_tenants")
        .select("id,slug,name,status,address,phone").eq("slug", slug).maybeSingle();
      if (!tenant || tenant.status !== "ACTIVE") return reply(404, { error: "TENANT_NOT_FOUND" }, origin);
      if (isTicket) {
        const { data: ticket } = await db.from("so_tickets")
          .select("id,user_id,status,ticket_no,number_prefix,line_cancel_event_id")
          .eq("id", refId).eq("tenant_id", tenant.id).is("deleted_at", null).maybeSingle();
        if (!ticket || ticket.status !== "CANCELLED" || !ticket.line_cancel_event_id)
          return reply(409, { error: "TICKET_NOT_CANCELLED" }, origin);
        if (!await canManageRecipient(db, tenant.id, user.id, ticket.user_id))
          return reply(403, { error: "NOT_AUTHORIZED" }, origin);
        return pushNotice(db, tenant, ticket.user_id, "TICKET_CANCELLED", ticket.line_cancel_event_id,
          flexNotice("已取消排隊", [
            "店家：" + tenant.name,
            "取消號碼：" + ticketNumber(ticket),
            "此號碼已不在候位名單中。",
            ...shopDetails(tenant),
          ], [{ label: "查看我的紀錄", uri: liffManageLink(await shopLinkContext(db, tenant), "ticket", ticket.id, "view") }]), origin);
      }
      const { data: booking } = await db.from("so_reservations")
        .select("id,user_id,status,booking_date,booking_time,party_size,customer_name,customer_phone,line_cancel_event_id,line_update_event_id,selected_items")
        .eq("id", refId).eq("tenant_id", tenant.id).is("deleted_at", null).maybeSingle();
      if (!booking || !await canManageRecipient(db, tenant.id, user.id, booking.user_id))
        return reply(403, { error: "NOT_AUTHORIZED" }, origin);
      const detail = [
        "店家：" + tenant.name,
        "日期：" + booking.booking_date,
        "時間：" + String(booking.booking_time).slice(0, 5),
        "人數：" + booking.party_size + " 位",
        "預約姓名：" + (booking.customer_name || "未提供"),
        "聯絡電話：" + (booking.customer_phone || "未提供"),
        ...selectedServicesText(booking.selected_items),
        ...shopDetails(tenant),
      ];
      if (payload.action === "notify-reservation-cancel") {
        if (booking.status !== "CANCELLED" || !booking.line_cancel_event_id)
          return reply(409, { error: "RESERVATION_NOT_CANCELLED" }, origin);
        return pushNotice(db, tenant, booking.user_id, "RESERVATION_CANCELLED", booking.line_cancel_event_id,
          flexNotice("預約已取消", detail, [
            { label: "查看我的紀錄", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "view") },
          ]), origin);
      }
      if (booking.status !== "CONFIRMED" || !booking.line_update_event_id)
        return reply(409, { error: "RESERVATION_NOT_UPDATED" }, origin);
      return pushNotice(db, tenant, booking.user_id, "RESERVATION_UPDATED", booking.line_update_event_id,
        flexNotice("預約已更新", [...detail, "以下為目前最新的預約資訊。"], [
          { label: "編輯預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "edit") },
          { label: "取消預約", uri: liffManageLink(await shopLinkContext(db, tenant), "reservation", booking.id, "cancel") },
        ]), origin);
    }
    return reply(400, { error: "UNKNOWN_ACTION" }, origin);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = ["LOGIN_REQUIRED", "INVALID_SUPABASE_SESSION", "INVALID_LINE_ID_TOKEN", "LINE_ID_TOKEN_EXPIRED", "LINE_ID_TOKEN_AUDIENCE_MISMATCH", "LINE_ACCESS_TOKEN_EXPIRED", "LINE_ACCESS_TOKEN_REQUIRED", "LINE_ACCESS_TOKEN_CHANNEL_MISMATCH", "INVALID_LINE_IDENTITY", "LINE_PROFILE_SCOPE_REQUIRED", "LINE_PROFILE_IDENTITY_MISMATCH"].includes(msg) ? 401 : ["LINE_LOGIN_NOT_CONFIGURED", "SUPABASE_ADMIN_NOT_CONFIGURED"].includes(msg) ? 503 : 500;
    if (status === 500) console.error("LINE integration operation failed", error instanceof Error ? error.name : "unknown");
    return reply(status, { error: status === 500 ? "INTERNAL_ERROR" : msg }, origin);
  }
});
