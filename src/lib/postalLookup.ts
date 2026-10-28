export type PostalLocation={city:string;state:string;stateCode?:string;locality?:string;provider:'zippopotam'|'india-post'}

const GENERIC=/^[A-Z0-9][A-Z0-9 -]{2,11}$/i
const FORMATS:Record<string,RegExp>={IN:/^[1-9]\d{5}$/,US:/^\d{5}(?:-\d{4})?$/,GB:/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,CA:/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,AU:/^\d{4}$/,SG:/^\d{6}$/,AE:/^[A-Z0-9][A-Z0-9 -]{2,11}$/i}

export const normalizePostal=(value:unknown)=>String(value||'').trim().toUpperCase().replace(/\s+/g,' ')
export const validPostalFormat=(country:unknown,postal:unknown)=>{const code=String(country||'').trim().toUpperCase(),value=normalizePostal(postal);return /^[A-Z]{2}$/.test(code)&&GENERIC.test(value)&&(FORMATS[code]||GENERIC).test(value)}

export function parseZippopotam(data:any):PostalLocation|null{
 const place=Array.isArray(data?.places)?data.places.find((item:any)=>item&&typeof item==='object'):null
 const city=String(place?.['place name']||'').trim(),state=String(place?.state||'').trim()
 return city&&state?{city:city.slice(0,120),state:state.slice(0,120),stateCode:String(place?.['state abbreviation']||'').trim().slice(0,12)||undefined,provider:'zippopotam'}:null
}

export function parseIndiaPost(data:any):PostalLocation|null{
 const envelope=Array.isArray(data)?data.find((item:any)=>String(item?.Status||'').toLowerCase()==='success'&&Array.isArray(item?.PostOffice)&&item.PostOffice.length):null
 const office=envelope?.PostOffice?.[0]
 if(!office)return null
 const usable=(value:unknown)=>{const text=String(value||'').trim();return /^(?:na|n\/a|null|undefined|-)?$/i.test(text)?'':text}
 const city=[office.Block,office.District,office.Division,office.Region].map(usable).find(Boolean)||'',state=usable(office.State),locality=usable(office.Name)
 return city&&state?{city:city.slice(0,120),state:state.slice(0,120),locality:locality.slice(0,120)||undefined,provider:'india-post'}:null
}
