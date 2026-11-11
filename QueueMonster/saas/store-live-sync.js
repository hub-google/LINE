// One store-scoped Realtime/HTTP fallback controller for the public board,
// merchant operations and customer booking/queue views.
// Broadcasts only invalidate a store snapshot; consumers use existing RPCs.
export function createStoreLiveSync({
  client,slug,refresh,isActive=()=>true,canRefresh=()=>true,onModeChange=()=>{},
  fallbackMs=10000,reconcileMs=60000
}){
  const valid=/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug||"");
  let running=false,connected=false,channel=null,epoch=0,failures=0;
  let retryTimer=null,pollTimer=null,eventTimer=null,lastRequestAt=Date.now();
  let lastEventAt=0,inFlight=false,pending=false,mode="api",lastKind="queue";
  const canConnect=()=>running&&valid&&!document.hidden&&navigator.onLine&&isActive();
  const canRead=()=>canConnect()&&canRefresh();
  const modeChange=()=>{
    const next=connected&&navigator.onLine?"realtime":"api";
    if(mode!==next){mode=next;onModeChange(next);}
  };
  const errorText=error=>[error?.message,error?.name,error?.code,error?.status,
    error?.reason,error?.cause?.message,error?.cause?.code]
    .filter(Boolean).join(" ");
  function close(){
    const old=channel;channel=null;epoch++;connected=false;modeChange();
    if(old)void client.removeChannel(old).catch(()=>{});
  }
  function clearRetry(){
    if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
  }
  function retry(error){
    if(!canConnect()||retryTimer)return;
    const details=errorText(error);
    const quota=/too_many_connections|too many connected users|tenant_events|monthly|quota|rate.limit|\b429\b/i.test(details);
    // The 201st viewer can use API immediately without competing for sockets.
    const base=quota?120000:30000;
    const delay=Math.round(Math.min(600000,base*2**Math.min(failures++,4))*(.85+Math.random()*.3));
    retryTimer=setTimeout(()=>{retryTimer=null;connect();},delay);
  }
  function fail(reason,error){
    if(!running)return;
    console.warn("Store live sync unavailable; using 10s API:",reason,errorText(error));
    close();retry(error);
  }
  async function read(reason="event"){
    if(!canConnect())return;
    if(!canRead()||inFlight){pending=true;return;}
    inFlight=true;pending=false;
    try{
      await refresh({reason,kind:lastKind,reconcile:reason==="reconcile"});
      lastRequestAt=Date.now();
    }catch(error){
      console.warn("Store live-sync refresh failed:",errorText(error));
    }finally{
      inFlight=false;
      if(pending&&canRead())scheduleEventRefresh();
    }
  }
  function scheduleEventRefresh(kind="queue"){
    lastKind=kind;
    pending=true;
    if(!canConnect()||eventTimer)return;
    const delay=Math.max(250,1500-(Date.now()-lastEventAt));
    eventTimer=setTimeout(()=>{
      eventTimer=null;
      lastEventAt=Date.now();
      if(pending)void read("event");
    },delay);
  }
  function connect(){
    if(!canConnect()||channel||retryTimer)return;
    let next;
    try{
      next=client.channel("queue-board:"+slug,{config:{private:false,broadcast:{self:false}}});
      const currentEpoch=++epoch;
      channel=next;
      next.on("broadcast",{event:"invalidate"},message=>{
        const kind=message?.payload?.kind==="reservation"?"reservation":"queue";
        scheduleEventRefresh(kind);
      }).subscribe((status,error)=>{
        if(currentEpoch!==epoch||channel!==next)return;
        if(status==="SUBSCRIBED"){
          connected=true;failures=0;clearRetry();modeChange();
          // A write can occur while the initial RPC and subscription race.
          void read("connected");
        }else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)){
          fail(status,error);
        }
      });
    }catch(error){
      if(next&&channel===next)close();
      fail("SUBSCRIBE_EXCEPTION",error);
    }
  }
  function tick(){
    if(!running)return;
    if(!canConnect()){
      if(channel)close();
      return;
    }
    if(pending&&canRead()){void read("pending");return;}
    if(!channel&&!retryTimer)connect();
    if(!canRead())return;
    if(!connected)void read("fallback");
    else if(Date.now()-lastRequestAt>=reconcileMs)void read("reconcile");
  }
  function visibility(){
    if(!running)return;
    if(!canConnect()){
      clearRetry();close();
    }else{
      // Switching back to this window should show current data immediately.
      void read("resume");
      connect();
    }
  }
  function pageHide(){
    // Release a Free-plan socket when navigating away, including bfcache.
    clearRetry();close();
  }
  function pageShow(){
    // bfcache restores JavaScript without rerunning the module entrypoint.
    visibility();
  }
  function start(){
    if(running||!valid)return;
    running=true;lastRequestAt=Date.now();modeChange();onModeChange(mode);
    document.addEventListener("visibilitychange",visibility);
    window.addEventListener("online",visibility);
    window.addEventListener("offline",visibility);
    window.addEventListener("pagehide",pageHide);
    window.addEventListener("pageshow",pageShow);
    pollTimer=setInterval(tick,fallbackMs);
    connect();
  }
  function stop(){
    if(!running)return;
    running=false;
    clearRetry();
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
    if(eventTimer){clearTimeout(eventTimer);eventTimer=null;}
    pending=false;close();
    document.removeEventListener("visibilitychange",visibility);
    window.removeEventListener("online",visibility);
    window.removeEventListener("offline",visibility);
    window.removeEventListener("pagehide",pageHide);
    window.removeEventListener("pageshow",pageShow);
  }
  return {start,stop,tick,get mode(){return mode;},get connected(){return connected;}};
}
