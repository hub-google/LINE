
if("serviceWorker" in navigator && location.protocol==="https:"){
 window.addEventListener("load",()=>navigator.serviceWorker.register("./pwa-sw.js",{scope:"./"}).catch(()=>{}),{once:true});
}
