
    import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
    const SUPABASE_URL="https://unapiwajmgqqtdkixaab.supabase.co";
    const SUPABASE_ANON_KEY="sb_publishable_L09XC4Tekm6cZaPTTczm3g_Aap-SOSy";
    // Independent browser session: opening a TV board never signs out a customer or staff.
    const client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const params=new URLSearchParams(location.search);
    const slug=params.get("merchant")||"";
    const selectedSession=/^[0-9a-f-]{36}$/i.test(params.get("session")||"")?params.get("session"):null;
    const $=id=>document.getElementById(id);
    const localTime=date=>new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date);
    const validSlug=/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
    let lastSuccess=null,loading=false,refreshQueued=false;
    let lastData=null,staleFromFailure=false,disabled=false;
    function renderUpcoming(numbers){
      const list=$("upcoming");
      list.replaceChildren();
      if(!numbers.length){
        const li=document.createElement("li");li.className="empty";li.textContent="目前無人等候";list.appendChild(li);return;
      }
      for(const number of numbers){
        const li=document.createElement("li");li.textContent=String(number);list.appendChild(li);
      }
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
      if(staleFromFailure||!navigator.onLine||elapsed>45000){
        health("連線中斷｜畫面為上次成功同步資料","error");
        $("notice").textContent="最後成功同步："+localTime(lastSuccess)+"。請檢查網路，勿將此畫面視為即時叫號。";
        return;
      }
      health("定期更新正常","ok");
      $("notice").textContent="最後成功同步："+localTime(lastSuccess)+"；資料每 12 秒自動核對，網路斷線會提示。";
    }
    function renderUnits(sessions){
      const grid=$("unit-board");
      grid.replaceChildren();
      for(const s of sessions){
        const card=document.createElement("article");card.className="unit-card";
        const group=document.createElement("div");group.className="group";group.textContent=[s.group,s.name].filter(Boolean).join(" · ");
        const heading=document.createElement("h2");heading.textContent=s.unit||"服務單位";
        const now=document.createElement("div");now.className="unit-now";now.textContent=s.current||"—";
        const next=document.createElement("div");next.className="unit-next";
        next.textContent="接下來："+(Array.isArray(s.next)&&s.next.length?s.next.join("、"):"目前無人等候");
        const count=document.createElement("div");count.className="group";count.textContent="等候 "+Number(s.waiting||0)+" 組";
        card.append(group,heading,now,next,count);grid.append(card);
      }
      if(!sessions.length){
        const empty=document.createElement("article");empty.className="unit-card";empty.textContent="今天尚未設定開放場次";grid.append(empty);
      }
      $("single-board").hidden=true;grid.hidden=false;
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
      document.documentElement.style.setProperty("--merchant-board-ink","#"+rgb.map(v=>Math.round(v*.54).toString(16).padStart(2,"0")).join("").toUpperCase());
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
            $("current").textContent="—";renderUpcoming([]);
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
          renderUnits(Array.isArray(units.sessions)?units.sessions:[]);
          updateConnectionStatus();return;
        }
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
        $("current").textContent=data.current==null||data.current===""?"—":String(data.current);
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
    $("refresh").addEventListener("click",()=>{disabled=false;void refresh();});
    $("fullscreen").addEventListener("click",async()=>{
      try{
        if(document.fullscreenElement)await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      }catch(_error){$("notice").textContent="此瀏覽器不支援全螢幕，仍可直接使用看板。";}
    });
    document.addEventListener("fullscreenchange",()=>{
      $("fullscreen").textContent=document.fullscreenElement?"結束全螢幕":"全螢幕";
    });
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden&&!disabled)void refresh();
    });
    window.addEventListener("online",()=>{if(!disabled)void refresh();});
    window.addEventListener("offline",updateConnectionStatus);
    if(!validSlug){
      $("shop").textContent="未指定有效門市";
      health("請先選擇門市","error");
      $("notice").textContent="網址需包含正確的 merchant 門市代碼，例如 board.html?merchant=your-shop。";
    }else{
      void refresh();
      setInterval(()=>{if(!document.hidden&&!disabled)void refresh();},12000);
      setInterval(updateConnectionStatus,5000);
    }
  