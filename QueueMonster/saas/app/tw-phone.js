// Domestic Taiwan phone numbers follow the government's geographic prefix allocation.
// Validate the area code AND subscriber number length; a generic 8-15 digit check is incorrect.
const TW_PHONE=/^(?:09\d{8}|02[235678]\d{7}|03[2-689]\d{6}|037[2-9]\d{5}|04[23]\d{7}|04[78]\d{6}|049[2-9]\d{6}|05[2-7]\d{6}|06[235679]\d{6}|07[2-9]\d{6}|08[478]\d{6}|082[2-57-9]\d{5}|08266\d{4}|0836[2-9]\d{4}|089[2-9]\d{5})$/;

export function normalizeTaiwanPhone(input){
  const cleaned=String(input??"").trim().replace(/[\s()-]/g,"");
  return cleaned.startsWith("+886")?"0"+cleaned.slice(4):cleaned;
}

export function isValidTaiwanPhone(input){
  return TW_PHONE.test(normalizeTaiwanPhone(input));
}
