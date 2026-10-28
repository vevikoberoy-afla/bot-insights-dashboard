import {parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js/min'

export function normalizeE164Phone(value:unknown,defaultCountry=process.env.DEFAULT_PHONE_COUNTRY||'IN'){
 const raw=String(value||'').trim();if(!raw)return null
 try{const phone=parsePhoneNumberFromString(raw,defaultCountry.toUpperCase() as CountryCode);return phone?.isValid()?phone.number.slice(1):null}catch{return null}
}

export function validCountryCode(value:unknown){const code=String(value||'').trim().toUpperCase();try{return !!parsePhoneNumberFromString('2025550123',code as CountryCode)||/^[A-Z]{2}$/.test(code)}catch{return false}}

