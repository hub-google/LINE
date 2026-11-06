import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// The public browser never receives the PIN hash or the service-role key.
// The single-character PIN must be provisioned in qm_admin_pin_guard separately.
const ADMIN_EMAIL = "cit5055@gmail.com";
const EXPECTED_ORIGIN = "https://hub-google.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": EXPECTED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== EXPECTED_ORIGIN) return json({ error: "Origin not allowed" }, 403);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "管理登入服務設定不完整" }, 503);
  let body: { email?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (String(body.email || "").trim().toLowerCase() !== ADMIN_EMAIL || typeof body.pin !== "string" || body.pin.length !== 1) {
    return json({ error: "帳號或密碼錯誤" }, 401);
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // One failed attempt locks the PIN for 24 hours globally, including across IPs.
  // Only the service_role role can execute this atomic security-definer RPC.
  const { data: pinValid, error: checkError } = await admin.rpc("qm_admin_pin_check", { p_pin: body.pin });
  if (checkError) return json({ error: "管理登入服務未啟用" }, 503);
  if (pinValid !== true) return json({ error: "帳號或密碼錯誤或暫時停用，請稍後再試" }, 401);

  const { data: links, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink", email: ADMIN_EMAIL,
  });
  if (linkError || !links?.properties?.hashed_token) return json({ error: "無法建立管理員工作階段" }, 503);
  const publicAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sessionData, error: sessionError } = await publicAuth.auth.verifyOtp({
    token_hash: links.properties.hashed_token, type: "magiclink",
  });
  if (sessionError || !sessionData.session || !sessionData.user || sessionData.user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: "無法確認管理員身分" }, 503);
  }
  return json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    token_type: sessionData.session.token_type,
  });
});
