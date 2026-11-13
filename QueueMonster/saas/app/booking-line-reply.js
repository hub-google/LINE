// Merchant OA-only: use the shared platform LIFF when it was *opened from*
// the merchant OA chat. No per-merchant LIFF ID is required. The one-to-one
// chat is still necessary for LIFF sendMessages; otherwise offer a prefilled
// merchant chat URL and let the customer explicitly tap Send.
export async function requestBookingReply(liff, reservationId, config = {}) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId||""))
  throw Error("INVALID_RESERVATION_ID");
 const command=String(config.command||"確認預約 "+reservationId);
 if(config.merchantOaConnected!==true)return {requested:false,command,reason:"MERCHANT_OA_REQUIRED"};
 if(config.fromMerchantChat!==true)return {requested:false,command,reason:"MERCHANT_CHAT_REQUIRED"};
 try {
  if(!liff?.isInClient?.()||liff.getContext?.()?.type!=="utou"||
     typeof liff.sendMessages!=="function"||
     (config.expectedLiffId && liff.id && liff.id!==config.expectedLiffId))
    return {requested:false,command,reason:"MERCHANT_CHAT_REQUIRED"};
  await liff.sendMessages([{type:"text",text:command}]);
  return {requested:true,command};
 }catch(_){return {requested:false,command,reason:"LINE_SEND_FAILED"};}
}
