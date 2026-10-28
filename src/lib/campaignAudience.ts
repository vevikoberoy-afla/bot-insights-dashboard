import {supabase} from '@/lib/supabase'
import {SaaSError} from '@/lib/saas/context'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function explicitContactAudience(workspaceId:string,value:unknown){
 if(!Array.isArray(value)||value.length===0)return[]
 const ids=Array.from(new Set(value.map(String)))
 if(ids.length>10000||ids.some(id=>!uuid.test(id)))throw new SaaSError('INVALID_INPUT','Choose up to 10,000 valid contacts.',400)
 const result=await supabase.from('contacts').select('id').eq('client_id',workspaceId).in('id',ids)
 if(result.error)throw result.error
 if((result.data||[]).length!==ids.length)throw new SaaSError('INVALID_INPUT','One or more selected contacts do not belong to this workspace.',400)
 return ids
}
