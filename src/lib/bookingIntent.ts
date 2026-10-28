type Bookable = { id: string; name?: string | null }

const managementPattern = /\b(?:cancel|reschedule|manage|check|view)\s+(?:my\s+)?(?:booking|appointment)\b|\bbooking\s+status\b|\bBKG-[A-Z0-9]+\b/i
const discoveryPattern = /\b(?:book(?:ing)?|appointment|schedule|reserve|reservation|services?|available\s+(?:times?|slots?|appointments?)|calendar|offers?)\b/i
const naturalPattern = /\b(?:i\s+(?:want|need)|i(?:'d|\s+would)\s+like|can\s+i\s+(?:book|reserve|get)|find\s+(?:a\s+)?time)\b/i
const serviceRecommendationPattern = /\b(?:(?:recommend|suggest|find)\b.{0,40}\b(?:service|appointment|treatment|session|spa|massage|therapy|wellness)|(?:stressed?|relax|relaxation|pamper|unwind)\b.{0,40}\b(?:recommend|suggest|help|option|service|treatment))\b/i
const explicitBookingPattern = /\b(?:book|reserve|schedule)\b(?:\s+[a-z0-9'-]+){0,6}\s+\b(?:appointment|consultation|service|slot|table|seats?)\b|\b(?:need|want|like)\b(?:\s+[a-z0-9'-]+){0,6}\s+\b(?:appointment|reservation)\b|\b(?:appointment|table|seats?)\b.{0,80}\b(?:available|availability|free|book|reserve)\b/i
const normalize = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/[-_/.,()[\]{}'"!?…:;]+/g,' ').replace(/\s+/g,' ').trim()
const words=(value:unknown)=>normalize(value).split(' ').filter(word=>word.length>2&&!['book','booking','appointment','reserve','want','need','the','for'].includes(word))

export const isPotentialBookingRequest = (text:string) => managementPattern.test(text)||discoveryPattern.test(text)||naturalPattern.test(text)||serviceRecommendationPattern.test(text)
export const isBookingManagementRequest = (text:string) => managementPattern.test(text)
// This stricter check is used when another transactional flow already owns the
// session. It avoids treating generic phrases such as "I need something" as a
// flow switch while still recognizing a clear request to book a table/service.
export const isExplicitBookingRequest = (text:string) => managementPattern.test(text)||explicitBookingPattern.test(text)
export function findMentionedBookable(text:string,items:Bookable[]){
 const haystack=` ${normalize(text)} `,matches=items.filter(item=>{const name=normalize(item.name);return name.length>=2&&haystack.includes(` ${name} `)})
 if(matches.length===1)return matches[0]
 if(matches.length>1)return null
 const query=words(text),ranked=items.map(item=>{const name=words(item.name);return {item,score:name.length?name.filter(word=>query.includes(word)).length/name.length:0}}).filter(x=>x.score>=0.6).sort((a,b)=>b.score-a.score)
 return ranked.length&&(!ranked[1]||ranked[0].score>ranked[1].score)?ranked[0].item:null
}
