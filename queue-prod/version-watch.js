/* LINE 預約：自動偵測正式部署的新版本；不會清除 LINE / Supabase 登入資料。 */
(() => {
  "use strict";
  const meta = document.querySelector('meta[name="line-saas-build"]');
  const current = meta && meta.getAttribute("content");
  if (!/^[0-9a-f]{40}$/i.test(current || "")) return; // 原始碼預覽，不是正式部署
  const manifestUrl = new URL("./release.json", document.baseURI);
  const touched = new Set();
  const CHECK_MS = 60000;
  const IDLE_MS = 20000;
  let lastActivity = Date.now();
  let latest = "";
  let fetching = false;
  let checkingPage = false;
  let notice;

  function changed(el) {
    if (!el.isConnected) return false;
    if (el instanceof HTMLInputElement) {
      if (["button", "submit", "reset", "hidden"].includes(el.type)) return false;
      if (["checkbox", "radio"].includes(el.type)) return el.checked !== el.defaultChecked;
      return el.value !== el.defaultValue;
    }
    if (el instanceof HTMLTextAreaElement) return el.value !== el.defaultValue;
    if (el instanceof HTMLSelectElement) {
      return Array.from(el.options).some(option => option.selected !== option.defaultSelected);
    }
    return el.isContentEditable;
  }

  function unsavedChanges() {
    if (document.documentElement.dataset.unsavedMerchantLogo === "true") return true;
    for (const el of touched) {
      if (!el.isConnected) { touched.delete(el); continue; }
      if (changed(el)) return true;
    }
    return false;
  }

  function busyWithInput() {
    const el = document.activeElement;
    return !!el && el.matches('input,textarea,select,[contenteditable="true"]');
  }

  function lineIsRedirecting() {
    const q = new URLSearchParams(location.search);
    return ["liff.state", "code", "state", "access_token"].some(key => q.has(key));
  }

  function safeToReload() {
    return !document.hidden && !lineIsRedirecting() && !unsavedChanges() &&
      !busyWithInput() && (Date.now() - lastActivity >= IDLE_MS);
  }

  function showNotice() {
    if (notice || !document.body) return;
    notice = document.createElement("div");
    notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;bottom:14px;left:14px;z-index:2147483646;"+
      "max-width:min(410px,calc(100vw - 28px));background:#153b33;color:#fff;"+
      "padding:12px 14px;border-radius:12px;box-shadow:0 8px 25px #0003;"+
      "font:14px/1.5 system-ui,sans-serif";
    const text = document.createElement("span");
    text.textContent = "網站已有新版本，完成目前的輸入或操作後會自動更新。";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "現在更新";
    button.style.cssText = "margin-left:10px;padding:6px 9px;border:0;border-radius:6px;"+
      "background:#fff;color:#153b33;cursor:pointer;font:inherit";
    button.addEventListener("click", () => {
      if (unsavedChanges() && !confirm("目前輸入的資料可能尚未儲存，確定現在更新網頁？")) return;
      void tryReload(true);
    });
    notice.append(text,button);
    document.body.append(notice);
  }

  async function checkVersion() {
    if (fetching || document.hidden) return;
    fetching = true;
    try {
      const u = new URL(manifestUrl);
      u.searchParams.set("_t", String(Date.now())); // GitHub Pages CDN 與瀏覽器都不能沿用舊 URL
      const res = await fetch(u, {cache: "no-store", credentials: "same-origin"});
      if (!res.ok) return;
      const data = await res.json();
      if (!/^[0-9a-f]{40}$/i.test(data.build || "") || data.build === current) return;
      latest = data.build;
      await tryReload(false);
    } catch (e) {
      // 離線或部署中只延後檢查，不能妨礙預約／取號
      console.debug("[LINE version] Check deferred", e);
    } finally {
      fetching = false;
    }
  }

  async function tryReload(manual) {
    if (!latest || checkingPage || (!manual && !safeToReload())) {
      if (latest && unsavedChanges()) showNotice();
      return;
    }
    checkingPage = true;
    try {
      // 先確認 GitHub Pages 已可傳回新版 HTML，避免 CDN 尚未更新時反覆重載。
      const url = new URL(location.href);
      url.searchParams.set("__line_build", latest);
      url.searchParams.set("__line_fresh", String(Date.now()));
      const response = await fetch(url, {cache: "no-store", credentials: "same-origin"});
      if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return;
      const html = await response.text();
      const build = html.match(/<meta\s+name="line-saas-build"\s+content="([0-9a-f]{40})"/i);
      if (!build || build[1] !== latest) return;
      if (!manual && !safeToReload()) return;
      location.replace(url.href); // 保留 LIFF 店家、頁籤、預約參數及 hash
    } catch (e) {
      console.debug("[LINE version] Page not ready", e);
    } finally {
      checkingPage = false;
    }
  }

  document.addEventListener("input", event => {
    if (event.target instanceof HTMLElement &&
        event.target.matches('input,textarea,select,[contenteditable="true"]')) {
      touched.add(event.target);
    }
    lastActivity = Date.now();
  }, true);
  document.addEventListener("change", event => {
    if (event.target instanceof HTMLElement &&
        event.target.matches('input,textarea,select,[contenteditable="true"]')) {
      touched.add(event.target);
    }
    lastActivity = Date.now();
  }, true);
  document.addEventListener("pointerdown", () => { lastActivity = Date.now(); }, {passive: true, capture: true});
  document.addEventListener("keydown", () => { lastActivity = Date.now(); }, true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkVersion(); });
  window.addEventListener("focus", () => { void checkVersion(); });
  window.addEventListener("pageshow", () => { void checkVersion(); });
  setInterval(() => { void checkVersion(); }, CHECK_MS);
  setInterval(() => { void tryReload(false); }, 5000);
  setTimeout(() => { void checkVersion(); }, 2500);
})();
