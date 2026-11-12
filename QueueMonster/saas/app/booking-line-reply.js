// The merchant's own LIFF must be launched from that merchant OA's 1:1 chat.
// LINE sends to the *current chat*, never to an arbitrary bot by access token.
// A failed send cannot roll back or duplicate the already committed booking.
export async function requestBookingReply(liff, reservationId, config = {}) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId||""))throw Error("INVALID_RESERVATION_ID");
 const command="確認預約 "+reservationId;
 const merchantLiffId=String(config.merchantLiffId||"");
 if(config.merchantOaConnected!==true || !/^[0-9]{8,}-[A-Za-z0-9]+$/.test(merchantLiffId))
   return {requested:false,command,reason:"MERCHANT_LIFF_REQUIRED"};
 try {
  if(!liff?.isInClient?.()||liff.getContext?.()?.type!=="utou" ||
      (liff.id && liff.id!==merchantLiffId) ||
      typeof liff.sendMessages!=="function" ||
      liff.isApiAvailable?.("sendMessages")===false)
    return {requested:false,command,reason:"MERCHANT_CHAT_REQUIRED"};
  await liff.sendMessages([{type:"text",text:command}]);
  return {requested:true,command};
 }catch(_){return {requested:false,command,reason:"LINE_SEND_FAILED"};}
}
