// Domestic Taiwan phone numbers follow the government's geographic prefix allocation.
// Validate the area code AND subscriber number length; a generic 8-15 digit check is incorrect.
const TW_PHONE=/^(?:09\d{8}|02[235678]\d{7}|03[2-689]\d{6}|037[2-9]\d{5}|04[23]\d{7}|04[78]\d{6}|049[2-9]\d{6}|05[2-7]\d{6}|06[235679]\d{6}|07[2-9]\d{6}|08[478]\d{6}|082[2-57-9]\d{5}|08266\d{4}|0836[2-9]\d{4}|089[2-9]\d{5})$/;

export function normalizeTaiwanPhone(input){
  const cleaned=String(input??"").trim().replace(/[\s()-]/g,"");
  return cleaned.startsWith("+886")?"0"+cleaned.slice(4):cleaned;
}

export function isValidTaiwanPhone(input){
  const raw=String(input??"").trim();
  // Honor an explicitly separated area code; 08-2234567 must not be
  // reinterpreted as a Kinmen 082 number when the caller chose area 08.
  const parts=raw.match(/^(0\d{1,3})[\s－-]+(\d+)$/);
  if(parts&&TW_LANDLINE_AREAS.includes(parts[1]))
    return isValidTaiwanPhoneParts("landline","",parts[1],parts[2]);
  return TW_PHONE.test(normalizeTaiwanPhone(input));
}

export const TW_LANDLINE_AREAS=["02","03","037","04","049","05","06","07","08","082","0826","0836","089"];

const LANDLINE_EXAMPLES={
 "02":{example:"23456789",description:"固定 8 碼"},
 "03":{example:"2123456",description:"固定 7 碼"},
 "037":{example:"234567",description:"固定 6 碼"},
 "04":{example:"22345678",description:"臺中 2、3 開頭為 8 碼；彰化 7、8 開頭為 7 碼"},
 "049":{example:"2345678",description:"固定 7 碼"},
 "05":{example:"2345678",description:"固定 7 碼"},
 "06":{example:"2345678",description:"固定 7 碼"},
 "07":{example:"2345678",description:"固定 7 碼"},
 "08":{example:"4123456",description:"固定 7 碼"},
 "082":{example:"234567",description:"固定 6 碼"},
 "0826":{example:"61234",description:"固定 5 碼"},
 "0836":{example:"21234",description:"固定 5 碼"},
 "089":{example:"234567",description:"固定 6 碼"}
};

export function getTaiwanLandlineHint(area){
 return LANDLINE_EXAMPLES[area]||{example:"",description:"請選擇市話區碼"};
}

const LANDLINE_LOCAL_RULES={
 "02":/^[235678]\d{7}$/,
 "03":/^[2-689]\d{6}$/,
 "037":/^[2-9]\d{5}$/,
 "04":/^(?:[23]\d{7}|[78]\d{6})$/,
 "049":/^[2-9]\d{6}$/,
 "05":/^[2-7]\d{6}$/,
 "06":/^[235679]\d{6}$/,
 "07":/^[2-9]\d{6}$/,
 "08":/^[478]\d{6}$/,
 "082":/^[2-57-9]\d{5}$/,
 "0826":/^6\d{4}$/,
 "0836":/^[2-9]\d{4}$/,
 "089":/^[2-9]\d{5}$/
};

export function isValidTaiwanPhoneParts(type,mobile,area,local){
 if(type==="mobile")return /^09\d{8}$/.test(String(mobile??""));
 if(type==="landline")return LANDLINE_LOCAL_RULES[area]?.test(String(local??""))===true;
 return false;
}
