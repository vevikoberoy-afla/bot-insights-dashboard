export type ProgressTone='professional'|'friendly'|'concise'|'empathetic'|'playful'|'luxury'|string
export type ProgressMoment='working'|'selection_added'
export type FlowProgressDomain='product'|'booking'|'support'
export type FlowProgressAction={domain:FlowProgressDomain;kind:string;value?:unknown;label?:string}

const cleanSubject=(value:string)=>value
 .replace(/\b(?:i\s+(?:want|need|would like)\s+(?:to\s+)?(?:buy|order|get|find)|do you have|show me|please|product)\b/gi,' ')
 .replace(/[?!.,]+/g,' ')
 .replace(/\s+/g,' ')
 .trim()
 .slice(0,60)

function productSubject(text:string){
 const match=text.match(/(?:order|buy|get|find|have|show(?:\s+me)?)\s+(?:me\s+|a\s+|an\s+|the\s+|some\s+)?(.+?)(?:\s+(?:please|for me|in stock))?[?.!]*$/i)
  ||text.match(/\bproduct\s*[(:-]?\s*([^).?!]+)\)?[?.!]*$/i)
 return cleanSubject(match?.[1]||'')
}

function bookingDetails(text:string){
 const people=text.match(/\b(?:for\s+)?(\d{1,3})\s*(?:people|persons|guests|seats?)\b/i)?.[1]
  ||text.match(/\btable\s+for\s+(\d{1,3})\b/i)?.[1]
 const date=text.match(/\b(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\b/i)?.[1]
 const parts=[people?`for ${people}`:'',date?`on ${date}`:''].filter(Boolean)
 return parts.length?` ${parts.join(' ')}`:''
}

const pick=(values:string[],variant:number)=>values[Math.abs(variant)%values.length]

export function buildProgressAcknowledgement(text:string,tone:ProgressTone='friendly',hint?:'product'|'booking'|'support'|'general',moment:ProgressMoment='working',variant=0){
 const key=String(tone||'friendly').toLowerCase()
 if(moment==='selection_added'){
  const selections:Record<string,string[]>={
   professional:['Your selection has been added. Here is your updated cart.','The selected items are now in your cart. You can review them below.'],
   concise:['Added. Here is your updated cart.','Your selection is in the cart.'],
   empathetic:['All set — I’ve added your selection. Let’s make sure the cart looks right.','Your items are safely in the cart. Here is the updated summary.'],
   playful:['Nice choice — those items are in. Let’s take a look at your cart.','All set — your picks are in the cart. Here is what we have so far.'],
   luxury:['Your selection has been added. Here is your curated cart.','Everything is in place. Please review your selection below.'],
   friendly:['Perfect — I’ve added those items. Here is your updated cart.','Great, your selection is in the cart. Let’s review it.','All set — those items are added. You can continue or browse for something else.'],
  }
  return pick(selections[key]||selections.friendly,variant)
 }
 const value=String(text||'').trim()
 const product=hint==='product'||/\b(?:buy|order|shop|catalog(?:ue)?|products?|items?|sku|in stock|do you have|show me)\b/i.test(value)
 const booking=hint==='booking'||/\b(?:book|booking|reserve|reservation|appointment|table|seat|slot)\b/i.test(value)
 const support=hint==='support'||/\b(?:order status|track|return|refund|cancel|ticket|support|complaint)\b/i.test(value)
 const kind=support?'support':booking?'booking':product?'product':'general'
 const subject=kind==='product'?productSubject(value):''
 const target=subject?` “${subject}”`:' the best matches'
 const detail=kind==='booking'?bookingDetails(value):''
 const copy:Record<string,Record<string,string[]>>={
  professional:{product:[`Certainly. I’m checking our catalogue for${target} now.`,`I’ll review the catalogue for${target} and bring back the closest options.`],booking:[`Certainly. I’m checking availability${detail} now.`,`I’ll check the available times${detail} now.`],support:['Certainly. I’m checking that for you now.','I’m reviewing those details now.'],general:['Certainly. I’m looking into that now.','I’ll check that for you now.']},
  concise:{product:[`Checking the catalogue for${target} now.`,`Finding matching options for${target}.`],booking:[`Checking availability${detail} now.`,`Finding available times${detail}.`],support:['Checking that now.','Reviewing the details now.'],general:['Looking into that now.','Checking that now.']},
  empathetic:{product:[`Absolutely — I’ll carefully find the best match for${subject?` “${subject}”`:' what you need'}.`,`I understand what you’re looking for. Let me find the closest options.`],booking:[`I’d be happy to help — I’m checking availability${detail} now.`,`Let me find a time that works well${detail}.`],support:['I understand — let me check that carefully for you now.','I’ll review this carefully and help you sort it out.'],general:['I’m on it — let me check that carefully for you.','Let me look into that for you.']},
  playful:{product:[`Nice choice — I’m checking the catalogue for${target} now.`,`Good one — let me find the closest options for${target}.`,`I’m searching the shelves for${target}. Give me a moment.`],booking:[`That sounds like a fantastic plan. I’m checking availability${detail} now.`,`Lovely plan — let me find an open time${detail}.`],support:['I’m on the case — give me one quick moment.','Let me dig into that for you.'],general:['Good question — let me check.','Let me look into that for you.']},
  luxury:{product:[`An excellent choice. Allow me a moment to curate the finest matches for${subject?` “${subject}”`:' you'}.`,`I’ll curate the most suitable options for${subject?` “${subject}”`:' you'} now.`],booking:[`A wonderful plan. Allow me to check availability${detail} for you.`,`I’ll find the most suitable availability${detail}.`],support:['Allow me a moment to review that for you personally.','I’ll review those details for you now.'],general:['Allow me a moment to look into that for you.','I’ll take care of that now.']},
  friendly:{product:[`Nice choice — I’m checking our catalogue for${target} now.`,`Let me find the closest matches for${target}.`,`I’m checking what we have for${target}. Just a moment.`],booking:[`That sounds like a lovely plan — I’m checking availability${detail} now.`,`Let me find the best available time${detail}.`],support:['Got it — I’m checking that for you now. Just a moment.','Let me review those details for you.'],general:['Good question — I’m checking that for you now.','Let me look into that for you.']},
 }
 return pick((copy[key]||copy.friendly)[kind],variant)
}

export function progressFlowHint(text:string,activeFlowId?:string|null):FlowProgressDomain|null{
 const value=String(text||'').trim()
 if(!value)return null
 if(activeFlowId&&/\b(?:continue|proceed|confirm|cancel|pay|payment|checkout|status|track|search|show\s+(?:me\s+)?(?:products?|menu|slots?))\b/i.test(value))return activeFlowId.startsWith('booking-')?'booking':activeFlowId.startsWith('order-')?'product':'support'
 if(/\b(?:track|tracking|where\s+is|order\s+(?:status|details|tracking|update)|return|refund|exchange|replace|damaged|ticket|complaint|cancel\s+(?:my\s+)?order|change\s+(?:my\s+)?order)\b/i.test(value))return'support'
 if(/\b(?:book|booking|reserve|reservation|appointment|schedule|table|seats?|available\s+(?:time|slot)|reschedule|cancel\s+(?:my\s+)?booking)\b/i.test(value))return'booking'
 if(/\b(?:shop|catalog(?:ue)?|products?|menu|buy|purchase|checkout|cart|do\s+you\s+have|in\s+stock|show\s+me\s+(?:items?|products?|catalog(?:ue)?|menu)|place\s+(?:an?\s+)?order|order\s+(?:something|an?\s+[a-z0-9][a-z0-9 -]{1,40}))\b/i.test(value))return'product'
 return null
}

export function buildFlowActionAcknowledgement(action:FlowProgressAction,tone:ProgressTone='friendly',variant=0){
 const kind=String(action.kind||'').toLowerCase(),value=String(action.value||'').toLowerCase(),label=String(action.label||'').trim()
 const domainLabel=action.domain==='booking'?'booking':action.domain==='product'?'order':'request'
 let copies:string[]
 if(kind==='cancel'||value==='cancel')copies=[`Understood — I’m cancelling this ${domainLabel} now.`,`No problem — I’m closing this ${domainLabel} request.`]
 else if(kind==='payment'||/cash|upi|card|payment/.test(value))copies=['Perfect — I’m preparing the secure payment details now.','Got it — I’m opening the secure payment step.']
 else if(kind==='confirm'||value==='confirm')copies=action.domain==='booking'?['Everything looks good — I’m confirming your booking now.','I’m securing your booking now.']:action.domain==='product'?['Everything looks good — I’m placing your order securely now.','I’m confirming your order now.']:['I’m confirming those details now.']
 else if(kind==='products'||kind==='quantity')copies=['Perfect — I’ve saved your selection. I’m updating the cart now.','Got it — I’m adding those items to your cart.']
 else if(kind==='edit'||kind==='edit_cart'||value==='edit')copies=[`No problem — I’m opening your ${action.domain==='booking'?'booking':'cart'} for changes.`,'Of course — you can update your selection next.']
 else if(kind==='coupon'||kind==='offer')copies=['I’m applying that offer and recalculating the total now.','Great — I’m checking that discount against your cart.']
 else if(kind==='choice'&&/checkout|proceed|continue/.test(value))copies=action.domain==='booking'?['Great — I’m preparing the next booking step now.']:action.domain==='product'?['Great — I’m preparing checkout for your cart now.']:['I’m preparing the next step now.']
 else if(kind==='search')copies=[`I’m searching the catalogue for “${label||String(action.value||'that product')}” now.`,`Let me find the closest product matches for “${label||String(action.value||'your search')}”.`]
 else if(kind==='date'||kind==='slot'||kind==='preview_date'||kind==='location'||kind==='branch')copies=['I’m checking availability for that selection now.','Great — I’m finding the available times for that choice.']
 else if(kind==='status'||/status|track/.test(value))copies=['I’m checking the latest status now.','Let me retrieve the current update for you.']
 else copies=action.domain==='booking'?['I’m preparing the next booking step now.']:action.domain==='product'?['I’m updating your order now.']:['I’m checking those details now.']
 const selected=pick(copies,variant)
 if(String(tone).toLowerCase()==='concise')return selected.replace(/^(Perfect|Got it|Great|Understood|No problem|Of course|Everything looks good)\s*[—-]\s*/i,'')
 if(String(tone).toLowerCase()==='professional')return selected.replace(/^Perfect\s*[—-]\s*/i,'Certainly. ').replace(/^Great\s*[—-]\s*/i,'Certainly. ')
 return selected
}
