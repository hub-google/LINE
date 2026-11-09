
(() => {
  const qs=new URLSearchParams(location.search);
  const marketingKeys=new Set(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"]);
  const hasOnlyMarketingParameters=[...qs.keys()].every(key=>marketingKeys.has(key));
  const atBookingRoot=/\/(?:saas|booking)\/(?:index\.html)?$/.test(location.pathname);
  const isUnscopedCustomer=qs.getAll("view").at(-1)==="customer" && !qs.has("merchant");
  const lineCallbackKeys=["liff.state","code","state","access_token","ticket","manage","recover"];
  if(atBookingRoot && isUnscopedCustomer && !location.hash && !lineCallbackKeys.some(key=>qs.has(key))){
    const directory=new URL("./directory.html?mode=search",location.href);
    directory.pathname=directory.pathname.replace(/\/saas\/directory\.html$/,"/booking/directory.html");
    location.replace(directory.href);
    return;
  }
  if(atBookingRoot && hasOnlyMarketingParameters && !location.hash){
    const landing=new URL("./home.html",location.href);
    // Previously shared /saas/ links land on the new independent booking homepage.
    landing.pathname=landing.pathname.replace(/\/saas\/home\.html$/,"/booking/home.html");
    landing.search=location.search;
    location.replace(landing.href);
  }
})();
