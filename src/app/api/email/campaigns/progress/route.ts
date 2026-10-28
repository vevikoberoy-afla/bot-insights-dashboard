import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const number=(value:unknown,fallback:number)=>value===undefined||value===null||value===''?fallback:Number(value)

export async function GET(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),single=String(req.nextUrl.searchParams.get('id')||''),ids=(single?[single]:String(req.nextUrl.searchParams.get('ids')||'').split(',')).filter(id=>uuid.test(id)).slice(0,50)
 if(!ids.length)throw new SaaSError('INVALID_INPUT','Provide at least one valid campaign identifier.',400)
 const query=await supabase.from('campaigns').select('id,status,recipients_count,sent_count,delivered_count,open_count,click_count,bounced_count,complaint_count,failed_count,scheduled_at,completed_at,failure_reason,materialized_at,transport_mode').eq('client_id',ctx.workspaceId).in('id',ids)
 if(query.error)throw query.error;if(single&&!query.data?.length)throw new SaaSError('NOT_FOUND','Campaign not found.',404)
 const rows=await Promise.all((query.data||[]).map(async row=>{const metrics=await redis.hgetall<Record<string,string|number>>(`campaign:${row.id}:metrics`).catch(()=>null);if(!metrics)return row;return{...row,status:String(metrics.status||row.status),recipients_count:number(metrics.total,row.recipients_count),sent_count:number(metrics.sent,row.sent_count),failed_count:number(metrics.failed,row.failed_count),delivered_count:number(metrics.delivered,row.delivered_count),open_count:number(metrics.opened,row.open_count),click_count:number(metrics.clicked,row.click_count),bounced_count:number(metrics.bounced,row.bounced_count),complaint_count:number(metrics.complained,row.complaint_count)}}))
 return NextResponse.json(single?(rows[0]||null):{campaigns:rows},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return saasError(error)}}
