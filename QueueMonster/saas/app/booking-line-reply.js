// A successful SDK send means the request reached the chat, not that OA replied.
export async function requestBookingReply(liff, reservationId) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId||""))throw Error("INVALID_RESERVATION_ID");
 const command="確認預約 "+reservationId;
 try {
  if(!liff?.isInClient?.()||liff.getContext?.()?.type!=="utou")return {requested:false,command};
  await liff.sendMessages([{type:"text",text:command}]);
  return {requested:true,command};
 }catch(_){return {requested:false,command};}
}
