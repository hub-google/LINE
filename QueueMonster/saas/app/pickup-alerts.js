// One short on-demand chime. Audio is enabled only after a staff click.
export async function pickupChime(){
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw Error("此瀏覽器不支援接單提示音");
  const ctx=new Ctx();
  try{
    await ctx.resume();
    for(const [i,freq] of [880,1175].entries()){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+i*.19;
      oscillator.type="sine";oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.12,start+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.17);
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start(start);oscillator.stop(start+.18);
    }
    setTimeout(()=>void ctx.close().catch(()=>{}),650);
  }catch(error){void ctx.close().catch(()=>{});throw error;}
}
