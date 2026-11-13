// Uses the existing shared LIFF in a 1:1 chat with the correct OA.
// LINE SDK can send only to the current chat, never to an arbitrary bot.
// Authenticated, short-lived server proof restricts record disclosure.
// Without LIFF chat_message.write use a prefilled OA chat and manual Send.
export async function requestBookingReply(liff, reservationId, config = {}) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId||""))
  throw Error("INVALID_RESERVATION_ID");
 const command=String(config.command||"確認預約 "+reservationId);
 if(config.merchantOaConnected!==true && config.oaMode!=="PLATFORM")return {requested:false,command,reason:"OA_REQUIRED"};
 if(config.fromMerchantChat!==true && config.fromPlatformChat!==true)return {requested:false,command,reason:"OA_CHAT_REQUIRED"};
 try {
  if(!liff?.isInClient?.()||liff.getContext?.()?.type!=="utou"||
     typeof liff.sendMessages!=="function"||
     (config.expectedLiffId && liff.id && liff.id!==config.expectedLiffId))
    return {requested:false,command,reason:"MERCHANT_CHAT_REQUIRED"};
  await liff.sendMessages([{type:"text",text:command}]);
  return {requested:true,command};
 }catch(_){return {requested:false,command,reason:"LINE_SEND_FAILED"};}
}
