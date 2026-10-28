import { NextRequest, NextResponse } from 'next/server'
import { POST as handleChatPost, OPTIONS as handleChatOptions } from '../route'
import { flowActionRequestSchema, flowActionText } from '@/lib/chat/contracts'
import { ChatRequestContext } from '@/lib/chat/requestContext'
import { handleBookingFlow } from '@/lib/bookingFlow'
import { handleCommerceFlow } from '@/lib/commerceFlow'
import { handleSupportFlow } from '@/lib/supportFlow'
import { getCorsHeaders } from '@/lib/cors'
import { sessionRateLimit } from '@/lib/ratelimit'
import { localRateLimit } from '@/lib/security/rateLimitFallback'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'
import { getEffectiveEntitlements } from '@/lib/saas/entitlements'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/utils/withTimeout'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'
import { persistFlowTurn } from '@/lib/chat/persistFlowTurn'
import { attachFlowRevision, claimFlowAction, completeFlowAction, completedFlowAction, latestFlowAction } from '@/lib/chat/flowRevision'
import { loadAtomicChatTurnContext } from '@/lib/chat/turnContext'
import { getBotBookingBundle } from '@/lib/chat/bookingBundleCache'
import { getBotCommerceBundle } from '@/lib/chat/commerceBundleCache'
import { redis } from '@/lib/redis'
import { journeyPolicyFromFlow } from '@/lib/botJourney'

export async function POST(req: NextRequest) {
  let stageStarted = performance.now()
  const stages: string[] = []
  const markStage = (name: string) => { const now = performance.now(); stages.push(`${name};dur=${Math.round(now-stageStarted)}`); stageStarted = now }
  const origin = req.headers.get('origin')
  const contextId = req.nextUrl.searchParams.get('ctx')?.trim() || ''
  const urlBotId = req.nextUrl.searchParams.get('bot')?.trim() || ''
  const cors = await getCorsHeaders(contextId, origin, urlBotId)
  markStage('cors')
  let claimedRevision: number | undefined

  try {
    // Do not wrap req.clone() in NextRequest. NextRequest owns private request
    // state and reconstructing it from another NextRequest can throw in the
    // Next.js runtime. Read once and create a plain replay request only for the
    // backwards-compatible text-router path.
    const rawBody = await req.text()
    let requestBody: unknown = null
    try { requestBody = JSON.parse(rawBody) } catch {}
    const parsed = flowActionRequestSchema.safeParse(requestBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid or expired card action. Refresh the conversation and try again.' }, { status: 400, headers: cors })
    }
    const body = parsed.data
    const { input, session_id: sessionId } = body

    // Flow-start actions have no server-issued flow identity yet and still need
    // the text router. Existing clients therefore remain compatible.
    if (!input.flowId || !input.stepId) {
      const fallbackRequest = new NextRequest(req.url, {
        method: 'POST',
        headers: new Headers(req.headers),
        body: rawBody,
      })
      return handleChatPost(fallbackRequest)
    }

    let claims
    try {
      claims = verifyWidgetSessionToken(req.headers.get('x-widget-session-token') || '', 'widget')
      if (claims.sessionId !== sessionId || !urlBotId || claims.botId !== urlBotId) throw new Error('SESSION_SCOPE_MISMATCH')
    } catch {
      return NextResponse.json({ error: 'This chat session has expired. Refresh the widget and try again.' }, { status: 401, headers: cors })
    }

    const [rate,atomicContext] = await Promise.all([
      withTimeout(sessionRateLimit.limit(sessionId),300).catch(()=>null),
      loadAtomicChatTurnContext({clientId:claims.workspaceId,botId:claims.botId,sessionId,question:''}),
    ])
    let clientResult:any,botResult:any,sessionResult:any,entitlements:any
    if(atomicContext){
      clientResult={data:{id:claims.workspaceId,context_id:atomicContext.contextId},error:null}
      botResult={data:{id:claims.botId,journeyPolicy:atomicContext.bootstrap.botContext?.journeyPolicy},error:null}
      sessionResult={data:{...atomicContext.bootstrap.session,contacts:atomicContext.bootstrap.contact},error:null}
      entitlements=atomicContext.entitlements
    }else{
      ;[clientResult,botResult,sessionResult,entitlements]=await Promise.all([
        supabase.from('clients').select('id,context_id').eq('id',claims.workspaceId).maybeSingle(),
        supabase.from('bots').select('id,bot_flow').eq('id',claims.botId).eq('client_id',claims.workspaceId).maybeSingle(),
        supabase.from('sessions').select('id,session_id,mode,contact_id,contacts(name,email,phone)').eq('client_id',claims.workspaceId).eq('session_id',sessionId).maybeSingle(),
        getEffectiveEntitlements(claims.workspaceId),
      ])
    }
    markStage('authorization')
    if ((rate && !rate.success) || (!rate && !localRateLimit(`chat-flow:${sessionId}`, 8).success)) {
      return NextResponse.json({ error: 'Too many actions. Please wait a moment.' }, { status: 429, headers: cors })
    }

    const client = clientResult.data
    if (!client || !botResult.data || !sessionResult.data || (contextId && contextId !== client.id && contextId !== client.context_id)) {
      return NextResponse.json({ error: 'This chat session is not valid for this assistant.' }, { status: 403, headers: cors })
    }
    if (entitlements.runtime_allowed === false || entitlements.runtime_features?.['bots.enabled'] === false || entitlements.restriction_stage === 'stopped') {
      return NextResponse.json({ answer: 'This assistant is temporarily unavailable. Please contact the business directly.', mode: 'unavailable' }, { status: 503, headers: cors })
    }
    if (sessionResult.data?.mode === 'human' || sessionResult.data?.mode === 'waiting') {
      return NextResponse.json({ answer: null, mode: sessionResult.data.mode }, { headers: cors })
    }

    const requestContext = new ChatRequestContext(client.id, claims.botId, sessionId, entitlements)
    const bookingTurn=input.flowId.startsWith('booking-')
    const commerceTurn=input.flowId.startsWith('order-')
    const journeyPolicy=botResult.data?.journeyPolicy||journeyPolicyFromFlow(botResult.data?.bot_flow)
    if (journeyPolicy.supportOnly && (bookingTurn || commerceTurn)) {
      return NextResponse.json({ error: 'This support assistant cannot open shopping or booking cards. Start a new support message instead.' }, { status: 403, headers: cors })
    }
    if ((bookingTurn && journeyPolicy.allowBooking === false) || (commerceTurn && journeyPolicy.allowCommerce === false)) {
      return NextResponse.json({ error: 'This capability is disabled for this assistant.' }, { status: 403, headers: cors })
    }
    const bookingStateKey=`booking_flow:${client.id}:${claims.botId}:${sessionId}`
    const commerceStateKey=`commerce_flow:${client.id}:${claims.botId}:${sessionId}`
    const [revisionClaim,prefetchedBookingState,prefetchedCommerce]=await Promise.all([
      claimFlowAction({ clientId: client.id, botId: claims.botId, sessionId, flowId: input.flowId, expectedRevision: input.expectedRevision, actionId: input.actionId }),
      bookingTurn?Promise.all([
        redis.get<any>(bookingStateKey),
        getBotBookingBundle({clientId:client.id,botId:claims.botId,loadConfig:()=>requestContext.getBotCommerceConfig()}),
      ]).then(([state])=>state):Promise.resolve(undefined),
      commerceTurn?Promise.all([
        redis.get<any>(commerceStateKey),
        getBotCommerceBundle({clientId:client.id,botId:claims.botId,loadConfig:()=>requestContext.getBotCommerceConfig()}),
      ]).then(([state,bundle])=>({state,bundle})):Promise.resolve(undefined),
    ])
    claimedRevision = revisionClaim.revision
    markStage('revision_claim')
    if (!revisionClaim.accepted) {
      const audit = await supabase.from('chat_action_audit').insert({
        client_id: client.id,
        bot_id: claims.botId,
        session_id: sessionId,
        flow_id: input.flowId,
        step_id: input.stepId,
        action_id: input.actionId,
        outcome: revisionClaim.replay ? 'replay' : 'stale',
        expected_revision: input.expectedRevision,
        actual_revision: revisionClaim.revision,
      })
      if (audit.error && !['42P01', 'PGRST205'].includes(audit.error.code || '')) {
        console.warn('[chat flow] action audit failed', audit.error.message)
      }
      if (revisionClaim.replay) {
        const completed = await completedFlowAction(client.id, claims.botId, sessionId, input.flowId, input.actionId)
        if (completed) return NextResponse.json(completed, { headers: cors })
      }
      const latest=await latestFlowAction(client.id,claims.botId,sessionId,input.flowId)
      if(latest&&latest.revision===revisionClaim.revision&&latest.result)return NextResponse.json({...latest.result,recovered:true},{headers:{...cors,'X-Flow-Recovered':'1'}})
      return NextResponse.json({error:'flow_sync_pending',recoverable:true,retry_after_ms:250,revision:revisionClaim.revision},{status:409,headers:cors})
    }

    const contactRow = (sessionResult.data as any)?.contacts
    const knownContact = contactRow ? { name: contactRow.name, email: contactRow.email, phone: contactRow.phone } : undefined
    const text = flowActionText(input)
    const domainInput = { clientId: client.id, botId: claims.botId, sessionId, text, interaction: input, channel: 'web', knownContact, requestContext, prefetchedState:prefetchedBookingState, journeyPolicy }
    const result = input.flowId.startsWith('booking-')
      ? await handleBookingFlow(domainInput)
      : input.flowId.startsWith('order-')
        ? await handleCommerceFlow({...domainInput,prefetchedState:prefetchedCommerce?.state,prefetchedBundle:prefetchedCommerce?.bundle})
        : await handleSupportFlow(domainInput)

    if (!result) return NextResponse.json({ error: 'This card is no longer active. Continue from the latest card.', revision: revisionClaim.revision }, { status: 409, headers: cors })
    attachFlowRevision(result, revisionClaim.revision)
    markStage('domain_flow')

    const timing = requestContext.serverTiming()
    const responseBody = {
      answer: result.answer,
      messages: result.messages || [],
      flow: result.flow ?? null,
      source: result.source,
      ticket_id: result.ticketId || null,
      order_id: result.orderId || null,
      revision: revisionClaim.revision,
    }
    // Publish a recoverable response only after the new flow step is durable.
    // Otherwise another tab could receive the new card while Redis still held
    // the previous step and legitimately trip the stale-action guard again.
    if((result as any)._stateCommit)await (result as any)._stateCommit
    await Promise.all([
      persistFlowTurn({contextId:client.context_id||client.id,clientId:client.id,botId:claims.botId,sessionId,answer:result.answer,messages:result.messages||[],interaction:input,verifiedSession:sessionResult.data}),
      completeFlowAction(client.id,claims.botId,sessionId,input.flowId,input.actionId,responseBody).catch(error=>console.warn('[chat flow] action response cache failed',error)),
    ])
    markStage('commit_wave')
    return NextResponse.json(responseBody, { headers: { ...cors, ...(rate ? { 'X-RateLimit-Remaining': String(rate.remaining) } : {}), 'Server-Timing': [...stages, timing].filter(Boolean).join(', ') } })
  } catch (error) {
    console.error('[/api/chat/flow]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'temporarily_unavailable', answer: FRIENDLY_RETRY_MESSAGE, retryable: true, revision: claimedRevision }, { status: 500, headers: cors })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleChatOptions(req)
}
