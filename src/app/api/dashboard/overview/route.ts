import {NextRequest,NextResponse} from 'next/server'
import {getAuthenticatedWorkspaceUser} from '@/lib/requestAuth'
import {supabase} from '@/lib/supabase'

export const dynamic='force-dynamic'

export async function GET(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req,'overview')
 if(!user)return NextResponse.json({error:'You do not have access to this workspace overview'},{status:403})
 const workspace=user.workspaceId
 const [client,bots,activeBots,campaigns,activeCampaigns,tickets,resolvedTickets,datasets]=await Promise.all([
  supabase.from('clients').select('name').eq('id',workspace).maybeSingle(),
  supabase.from('bots').select('id,name,status,purpose,created_at').eq('client_id',workspace).order('created_at',{ascending:false}).limit(5),
  supabase.from('bots').select('id',{count:'exact',head:true}).eq('client_id',workspace).eq('status','active'),
  supabase.from('campaigns').select('id,name,status,channel,stats,created_at').eq('client_id',workspace).order('created_at',{ascending:false}).limit(5),
  supabase.from('campaigns').select('id',{count:'exact',head:true}).eq('client_id',workspace).in('status',['running','active']),
  supabase.from('tickets').select('id',{count:'exact',head:true}).eq('client_id',workspace),
  supabase.from('tickets').select('id',{count:'exact',head:true}).eq('client_id',workspace).in('status',['resolved','closed']),
  supabase.from('datasets').select('id,name,status,purpose,chunk_count,created_at').eq('client_id',workspace).order('created_at',{ascending:false}).limit(5),
 ])
 const error=client.error||bots.error||activeBots.error||campaigns.error||activeCampaigns.error||tickets.error||resolvedTickets.error||datasets.error
 if(error)return NextResponse.json({error:error.message},{status:500})
 const botRows=bots.data||[],campaignRows=campaigns.data||[]
 return NextResponse.json({
  clientName:client.data?.name||'there',
  stats:{
   activeBots:activeBots.count||0,
   activeCampaigns:activeCampaigns.count||0,
   ticketsRaised:tickets.count||0,
   ticketsResolved:resolvedTickets.count||0,
   outboundMessages:campaignRows.reduce((sum:number,row:any)=>sum+Number(row.stats?.sent||0),0),
   inboundMessages:0,
   totalSales:0,channels:0,
  },
  recentBots:botRows,recentCampaigns:campaignRows,recentDatasets:datasets.data||[],
 })
}
