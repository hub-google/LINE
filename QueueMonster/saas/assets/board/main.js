
    import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
    import {installBoardFullscreenFit} from "./fullscreen-fit.js";
    const SUPABASE_URL="https://unapiwajmgqqtdkixaab.supabase.co";
    const SUPABASE_ANON_KEY="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
    // Independent browser session: opening a TV board never signs out a customer or staff.
    const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const params=new URLSearchParams(location.search);
    const slug=params.get("merchant")||"";
    const sessionIdPattern=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    const selectedSession=sessionIdPattern.test(params.get("session")||"")?params.get("session"):null;
    function sessionBoardLink(id){
      const url=new URL(location.href);
      if(id)url.searchParams.set("session",id);
      else url.searchParams.delete("session");
      return url.toString();
    }
    function setSessionNavigation(session){
      const nav=$("board-session-nav");
      nav.hidden=!session;
      if(session){
        $("board-all-link").href=sessionBoardLink(null);
        $("board-session-name").textContent=[session.unit,session.name].filter(Boolean).join(" · ")||"場次叫號";
      }
    }
    const $=id=>document.getElementById(id);
    const boardFit=installBoardFullscreenFit();
    const localTime=date=>new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date);
    const validSlug=/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
    let lastSuccess=null,loading=false,refreshQueued=false;
    let lastData=null,staleFromFailure=false,disabled=false;
    let realtimeConnected=false,eventTimer=null,lastEventRefreshAt=0;
    function updateSyncMode(){
      const label=$("board-update-mode");
      if(!label)return;
      label.textContent=realtimeConnected&&navigator.onLine
        ?"叫號變動即時更新":"每 10 秒更新一次叫號";
      label.dataset.realtime=realtimeConnected&&navigator.onLine?"on":"fallback";
    }
    function requestEventRefresh(){
      if(disabled||document.hidden||!navigator.onLine||eventTimer)return;
      // Public channels carry only invalidation markers. Throttle even forged
      // messages to prevent turning a public display into an RPC flood.
      const wait=Math.max(250,1500-(Date.now()-lastEventRefreshAt));
      eventTimer=setTimeout(()=>{
        eventTimer=null;
        lastEventRefreshAt=Date.now();
        if(!disabled&&!document.hidden)void refresh();
      },wait);
    }
    function subscribeQueueChanges(){
      if(!validSlug)return;
      try{
        client.channel("queue-board:"+slug,{config:{private:false,broadcast:{self:false}}})
          .on("broadcast",{event:"invalidate"},requestEventRefresh)
          .subscribe(status=>{
            const previouslyConnected=realtimeConnected;
            realtimeConnected=status==="SUBSCRIBED";
            updateSyncMode();
            if(realtimeConnected&&!previouslyConnected&&!disabled&&!document.hidden){
              // Re-read once on connection/reconnection, closing the race
              // between the initial RPC and the live subscription.
              void refresh();
            }
          });
      }catch(error){
        realtimeConnected=false;updateSyncMode();
        console.warn("Queue board Realtime unavailable; using 10-second polling:",String(error?.message||error));
      }
    }
    function renderUpcoming(numbers){
      const list=$("upcoming");
      list.replaceChildren();
      if(!numbers.length){
        const li=document.createElement("li");li.className="empty";li.textContent="目前無人等候";list.appendChild(li);boardFit.schedule();return;
      }
      for(const number of numbers){
        const li=document.createElement("li");li.textContent=String(number);list.appendChild(li);
      }
      boardFit.schedule();
    }
    $("clock").textContent=localTime(new Date()).slice(0,5);
    setInterval(()=>{$("clock").textContent=localTime(new Date()).slice(0,5);},1000);
    function health(label,state){
      $("health").textContent=label;$("health").dataset.state=state;
    }
    function updateConnectionStatus(){
      if(!validSlug||disabled)return;
      if(!lastSuccess){health("正在取得最新叫號資料","loading");return;}
      const elapsed=Date.now()-lastSuccess.getTime();
      if(staleFromFailure||!navigator.onLine||elapsed>(realtimeConnected?90000:30000)){
        health("連線中斷｜畫面為上次成功同步資料","error");
        $("notice").textContent="最後成功同步："+localTime(lastSuccess)+"。請檢查網路，勿將此畫面視為即時叫號。";
        return;
      }
      health(realtimeConnected?"即時同步正常":"備援同步正常","ok");
      $("notice").textContent="最後成功同步："+localTime(lastSuccess)+
        (realtimeConnected?"；號碼變更即時更新，並定期核對。":"；每 10 秒自動同步，網路斷線會提示。");
    }
    function renderUnits(sessions){
      const grid=$("unit-board");
      grid.replaceChildren();
      setSessionNavigation(null);
      for(const s of sessions){
        const id=String(s.id||"");
        const canOpen=sessionIdPattern.test(id);
        const card=document.createElement(canOpen?"a":"article");
        card.className="unit-card"+(canOpen?" unit-card-link":"");
        if(canOpen){
          card.href=sessionBoardLink(id);
          card.setAttribute("aria-label","單獨顯示 "+([s.unit,s.name].filter(Boolean).join(" · ")||"此場次")+" 的叫號");
        }
        const group=document.createElement("div");group.className="group";group.textContent=[s.group,s.name].filter(Boolean).join(" · ");
        const heading=document.createElement("h2");heading.textContent=s.unit||"服務單位";
        const now=document.createElement("div");now.className="unit-now";
        const unitCurrent=String(s.current??"").trim();
        const unitNotCalled=!unitCurrent||["-","–","—"].includes(unitCurrent);
        now.textContent=unitNotCalled?"尚未\n叫號":unitCurrent;
        now.classList.toggle("is-empty",unitNotCalled);
        const next=document.createElement("div");next.className="unit-next";
        next.textContent="接下來："+(Array.isArray(s.next)&&s.next.length?s.next.join("、"):"目前無人等候");
        const count=document.createElement("div");count.className="group";count.textContent="等候 "+Number(s.waiting||0)+" 組";
        card.append(group,heading,now,next,count);
        if(canOpen){
          const action=document.createElement("span");
          action.className="unit-open";
          action.textContent="單獨顯示此場次";
          card.appendChild(action);
        }
        grid.append(card);
      }
      if(!sessions.length){
        const empty=document.createElement("article");empty.className="unit-card";empty.textContent="今天尚未設定開放場次";grid.append(empty);
      }
      $("single-board").hidden=true;grid.hidden=false;
      boardFit.schedule();
    }

    function renderSelectedSession(session){
      $("unit-board").hidden=true;
      $("single-board").hidden=false;
      setSessionNavigation(session||{name:"此場次目前未開放"});
      const rawCurrent=String(session?.current??"").trim();
      const notCalled=!rawCurrent||["-","–","—"].includes(rawCurrent);
      $("current").textContent=session?(notCalled?"尚未叫號":rawCurrent):"場次未開放";
      $("current").classList.toggle("is-empty",notCalled||!session);
      renderUpcoming(Array.isArray(session?.next)?session.next:[]);
    }

    function renderBoardBrand(store){
      const rawLogo=String(store?.logo_url||"").trim();
      const safeLogo=/^https:\/\/[^\s<>"']{1,490}$/i.test(rawLogo)?rawLogo:"";
      const img=$("shop-logo"),placeholder=$("shop-icon-fallback");
      if(img&&placeholder){
        img.hidden=!safeLogo;
        placeholder.hidden=!!safeLogo;
        if(safeLogo&&img.src!==safeLogo)img.src=safeLogo;
      }
      const accent=/^#[\da-fA-F]{6}$/.test(String(store?.accent||""))?store.accent.toUpperCase():"#462B52";
      const rgb=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16));
      const linear=rgb.map(v=>{const n=v/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});
      const lum=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
      document.documentElement.style.setProperty("--merchant-board-accent",accent);
      document.documentElement.style.setProperty("--merchant-board-contrast",lum>.179?"#281B31":"#FFFFFF");
      document.documentElement.style.setProperty("--merchant-board-ink","#"+rgb.map(v=>("0"+Math.round(v*.54).toString(16)).slice(-2)).join("").toUpperCase());
    }
    $("shop-logo")?.addEventListener("error",()=>{
      $("shop-logo").hidden=true;
      $("shop-icon-fallback").hidden=false;
    });
    async function refresh(){
      if(!validSlug)return;
      if(loading){refreshQueued=true;return;}
      loading=true;
      try{
        // Public read-only queue status: no LINE Login, Supabase anonymous sign-in,
        // customer booking data, or personal identifiers.
        const {data:units,error:unitError}=await client.rpc("so_unit_public_board",{p_slug:slug,p_session_id:selectedSession});
        if(unitError){
          // A suspended or deleted merchant is a permanent business-state error, not a network outage.
          // Do not poll a retired board every 12 seconds or keep showing stale called numbers.
          if(/找不到商家/.test(String(unitError.message||""))){
            disabled=true;lastData=null;lastSuccess=null;staleFromFailure=false;
            $("shop").textContent="門市暫停服務";
            $("current").textContent="暫停服務";$("current").classList.add("is-empty");renderUpcoming([]);
            $("single-board").hidden=false;$("unit-board").hidden=true;
            health("門市目前未開放叫號","error");
            $("notice").textContent="這間門市目前未啟用叫號服務。請確認店家狀態或重新取得連結。";
            return;
          }
          throw unitError;
        }
        renderBoardBrand(units);
        if(units?.multi){
          disabled=false;staleFromFailure=false;lastData=units;lastSuccess=new Date();
          $("shop").textContent=String(units.shop||slug);
          const sessions=Array.isArray(units.sessions)?units.sessions:[];
          if(selectedSession){
            // RPC filters by service_session_id, never mix another session's queue.
            renderSelectedSession(sessions.find(s=>s.id===selectedSession)||null);
          }else{
            renderUnits(sessions);
          }
          updateConnectionStatus();return;
        }
        setSessionNavigation(null);
        $("single-board").hidden=false;$("unit-board").hidden=true;
        const {data,error}=await client.rpc("so_public_board",{p_slug:slug,p_limit:5});
        if(error)throw error;
        if(!data||!data.shop_name||!Array.isArray(data.upcoming))throw Error("找不到可公開的門市叫號資訊");
        const now=new Date();
        disabled=false;
        staleFromFailure=false;
        lastData=data;
        lastSuccess=now;
        $("shop").textContent=String(data.shop_name||slug);
        const rawCurrent=String(data.current??"").trim();
        const notCalled=!rawCurrent||["-","–","—"].includes(rawCurrent);
        $("current").textContent=notCalled?"尚未叫號":rawCurrent;
        $("current").classList.toggle("is-empty",notCalled);
        renderUpcoming(data.upcoming);
        updateConnectionStatus();
      }catch(error){
        if(lastData){
          staleFromFailure=true; // retain the real last success time, but mark the snapshot stale
          updateConnectionStatus();
        }else{
          health("叫號資料暫時無法取得","error");
          $("shop").textContent="無法讀取門市";
          $("notice").textContent="請確認網路、門市網址及公開叫號服務是否開放。請勿以顯示的空白數字判斷叫號。";
        }
        console.warn("Queue board update failed:",String(error?.message||error));
      }finally{
        loading=false;
        if(refreshQueued){refreshQueued=false;void refresh();}
      }
    }
    // Polling remains automatic; no manual reload button is necessary.
    $("fullscreen").addEventListener("click",async()=>{
      try{
        if(document.fullscreenElement)await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      }catch(_error){$("notice").textContent="此瀏覽器不支援全螢幕，仍可直接使用看板。";}
    });
    document.addEventListener("fullscreenchange",()=>{
      $("fullscreen").textContent=document.fullscreenElement?"結束全螢幕":"全螢幕";
      boardFit.schedule();
    });
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden&&!disabled)void refresh();
    });
    window.addEventListener("online",()=>{if(!disabled)void refresh();});
    window.addEventListener("offline",()=>{realtimeConnected=false;updateSyncMode();updateConnectionStatus();});
    if(!validSlug){
      $("shop").textContent="未指定有效門市";
      health("請先選擇門市","error");
      $("notice").textContent="網址需包含正確的 merchant 門市代碼，例如 board.html?merchant=your-shop。";
    }else{
      updateSyncMode();
      void refresh();
      subscribeQueueChanges();
      // Realtime event notifications carry no customer details. Use a cheap
      // periodic consistency check while connected and 10-second polling only
      // when the WebSocket is unavailable or disconnected.
      setInterval(()=>{
        if(document.hidden||disabled)return;
        if(!realtimeConnected||!lastSuccess||Date.now()-lastSuccess.getTime()>=60000)void refresh();
      },10000);
      setInterval(updateConnectionStatus,5000);
    }
  