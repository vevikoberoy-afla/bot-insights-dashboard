const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTypeScript(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const module = { exports: {} }
  const localRequire = (id) => Object.prototype.hasOwnProperty.call(mocks, id) ? mocks[id] : require(id)
  new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
    localRequire, module, module.exports, filename, path.dirname(filename),
  )
  return module.exports
}

async function main() {
  let entitlementLoads = 0
  let configLoads = 0
  const entitlements = { runtime_allowed: true, runtime_features: {} }
  const config = { bookingEnabled: true, commerceEnabled: true }
  const { ChatRequestContext } = loadTypeScript('src/lib/chat/requestContext.ts', {
    '@/lib/saas/entitlements': {
      getEffectiveEntitlements: async () => { entitlementLoads += 1; return entitlements },
    },
    '@/lib/botCommerceConfig': {
      getBotCommerceConfig: async (_clientId, _botId, received) => {
        configLoads += 1
        assert.equal(received, entitlements)
        return config
      },
    },
  })

  const context = new ChatRequestContext('client-1', 'bot-1', 'session-1')
  const [e1, e2, c1, c2] = await Promise.all([
    context.getEntitlements(), context.getEntitlements(),
    context.getBotCommerceConfig(), context.getBotCommerceConfig(),
  ])
  assert.equal(e1, entitlements)
  assert.equal(e2, entitlements)
  assert.equal(c1, config)
  assert.equal(c2, config)
  assert.equal(entitlementLoads, 1, 'entitlements must load once per request')
  assert.equal(configLoads, 1, 'bot configuration must load once per request')
  assert.match(context.serverTiming(), /entitlements;dur=/)
  assert.match(context.serverTiming(), /bot-config;dur=/)

  const { flowActionRequestSchema, flowActionText } = loadTypeScript('src/lib/chat/contracts.ts')
  const valid = {
    session_id: 'session-123',
    flow_id: 'booking-1',
    step_id: 'schedule',
    input: { kind: 'slot', value: '2026-10-25T10:00:00Z', flowId: 'booking-1', stepId: 'schedule', expectedRevision: 0, actionId: 'action-12345678' },
  }
  assert.equal(flowActionRequestSchema.safeParse(valid).success, true)
  assert.equal(flowActionRequestSchema.safeParse({ ...valid, flow_id: 'forged' }).success, false)
  assert.equal(flowActionRequestSchema.safeParse({ ...valid, unexpected: true }).success, false)
  assert.equal(flowActionRequestSchema.safeParse({ ...valid, session_id: 'x'.repeat(181) }).success, false)
  assert.equal(flowActionText({ kind: 'text', value: 'hello', flowId: 'f', stepId: 's', expectedRevision: 0, actionId: 'action-12345678' }), 'hello')

  const migration = fs.readFileSync(path.join(root, 'supabase/091_atomic_chat_commits.sql'), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.chat_operations/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.commit_chat_booking/i)
  assert.match(migration, /claim_booking_addon_inventory\(p_client,booking_id/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.commit_chat_order/i)

  const revisionSource = fs.readFileSync(path.join(root, 'src/lib/chat/flowRevision.ts'), 'utf8')
  assert.match(revisionSource, /current ~= expected/)
  assert.match(revisionSource, /stale_flow_action|claimFlowAction/)
  assert.match(revisionSource, /latest-result/, 'the latest completed flow card should be cached for interruption recovery')
  assert.match(revisionSource, /latestFlowAction/, 'stale clients should be able to recover the last committed flow result')

  const flowRouteSource = fs.readFileSync(path.join(root, 'src/app/api/chat/flow/route.ts'), 'utf8')
  assert.doesNotMatch(flowRouteSource, /new NextRequest\(req\.clone\(\)\)/, 'flow route must not reconstruct a NextRequest from NextRequest.clone()')
  assert.match(flowRouteSource, /const rawBody = await req\.text\(\)/, 'flow route should replay the serialized request body safely')

  const widgetSource = fs.readFileSync(path.join(root, 'src/components/chat/ChatWidget.tsx'), 'utf8')
  assert.doesNotMatch(widgetSource, /sourceBadge\(|Verified Document|Live catalogue/, 'customer widget must not expose internal provenance controls')
  assert.match(widgetSource, /active_flow_id: activeFlowId/, 'widget should tell the router when a transactional flow is active')
  assert.match(widgetSource, /progressFlowHint\(question,activeFlowId\)/, 'widget should gate staged acknowledgements to transactional flows')
  assert.doesNotMatch(widgetSource, /const progressId=progressReply\(question\)/, 'normal RAG and greetings must not receive staged flow copy')
  assert.match(widgetSource, /messages\.filter\(message=>!message\.transient/, 'transient progress copy must not pollute persisted chat history')
  assert.match(widgetSource, /safeBrowserMessage/, 'browser chat persistence must redact checkout and payment secrets')
  assert.match(widgetSource, /message\.type==='payment_checkout'/, 'expiring payment tokens must be removed from browser history')
  assert.match(widgetSource, /appendProductCard/, 'catalogue searches should append a focused product card while retaining earlier cards')
  assert.match(widgetSource, /View cart summary/, 'an active cart must expose the compact floating cart summary')
  assert.match(widgetSource, /onCartPreview=\{mergeCartPreview\}/, 'quantity changes from every product card should merge into one cart draft')
  assert.match(widgetSource, /adjustCartQuantity\(item,-1\)/, 'the floating cart should expose quantity decrease controls')
  assert.match(widgetSource, /adjustCartQuantity\(item,1\)/, 'the floating cart should expose quantity increase controls')
  assert.match(widgetSource, /floating-cart-summary/, 'the compact cart should have an isolated readable color scope')
  assert.match(widgetSource, /data\.recoverable\s*!==\s*true/, 'a stale card should silently retry while its committed response is being recovered')
  assert.match(widgetSource, /data\.recovered/, 'the widget should replace the interrupted card with the saved current step')
  const cardsSource = fs.readFileSync(path.join(root, 'src/components/chat/AppleChatCards.tsx'), 'utf8')
  assert.match(cardsSource, /Browse other products/, 'the product carousel should expose in-card product search')
  assert.match(cardsSource, /postal-lookup/, 'checkout should verify the selected country and postal code')
  assert.match(cardsSource, /Download receipt/, 'verified payment should expose its receipt')
  assert.match(cardsSource, /onBrowse\(value,chosen\)/, 'product search must carry current draft selections')
  assert.match(cardsSource, /productsRef\.current/, 'cart preview should read products without depending on an unstable products array')
  assert.doesNotMatch(cardsSource, /\[quantities,products\]/, 'cart preview must not create a parent-child render loop')
  assert.match(cardsSource, /Proceed to delivery/, 'the editable cart must expose one final proceed action')
  assert.match(cardsSource, /Removed · price 0/, 'quantity zero should clearly remove a line and show a zero price')
  assert.match(cardsSource, /<Stepper value=\{item\.quantity\} min=\{0\}/, 'every cart line should have inline increase and decrease controls')
  const postalSource = fs.readFileSync(path.join(root, 'src/app/api/commerce/postal-lookup/route.ts'), 'utf8')
  const middlewareSource = fs.readFileSync(path.join(root, 'src/middleware.ts'), 'utf8')
  assert.match(middlewareSource, /pathname === '\/api\/commerce\/postal-lookup'/, 'the embedded widget postal lookup must bypass dashboard-session authentication')
  assert.match(postalSource, /api\.postalpincode\.in/, 'Indian PIN codes should use the India postal directory fallback')
  assert.match(postalSource, /localRateLimit\(`postal:/, 'the public postal lookup must remain rate limited')
  assert.match(postalSource, /Promise\.any\(lookups\)/, 'postal providers should race rather than add serial latency')
  assert.match(postalSource, /valid:\s*true,\s*verified:\s*false/, 'a postal-directory outage must not dead-end a format-valid checkout')
  assert.match(cardsSource, /Finding your city/, 'the checkout form should expose location lookup progress')
  assert.match(cardsSource, /City \/ district/, 'resolved city and state should remain visible and correctable')
  const postal = loadTypeScript('src/lib/postalLookup.ts')
  assert.equal(postal.validPostalFormat('IN','751007'),true)
  assert.equal(postal.validPostalFormat('IN','051007'),false)
  assert.deepEqual(postal.parseIndiaPost([{Status:'Success',PostOffice:[{Name:'Saheed Nagar',Block:'Bhubaneswar',District:'Khordha',State:'Odisha'}]}]),{city:'Bhubaneswar',state:'Odisha',locality:'Saheed Nagar',provider:'india-post'})
  assert.deepEqual(postal.parseZippopotam({places:[{'place name':'Beverly Hills',state:'California','state abbreviation':'CA'}]}),{city:'Beverly Hills',state:'California',stateCode:'CA',provider:'zippopotam'})

  const { buildProgressAcknowledgement,buildFlowActionAcknowledgement,progressFlowHint } = loadTypeScript('src/lib/chat/progressAcknowledgement.ts')
  assert.match(buildProgressAcknowledgement('I want to order a lamp','friendly'), /lamp/i)
  assert.match(buildProgressAcknowledgement('I want this product (Amber Lamp)','friendly'), /Amber Lamp/i)
  assert.match(buildProgressAcknowledgement('Book a table for 4 people on 18 Nov','playful'), /for 4 on 18 Nov/i)
  assert.match(buildProgressAcknowledgement('Cancel my booking','professional'), /checking that/i, 'cancellation must not be celebrated as a new booking')
  assert.match(buildProgressAcknowledgement('Show me shoes','luxury'), /excellent choice/i)
  assert.doesNotMatch(buildProgressAcknowledgement('I want to order a lamp','playful'), /[✨🔎]/, 'progress copy should not contain decorative emoji')
  assert.match(buildProgressAcknowledgement('', 'friendly', 'product', 'selection_added'), /added|cart/i)
  assert.notEqual(buildProgressAcknowledgement('I want to order a lamp','friendly','product','working',0), buildProgressAcknowledgement('I want to order a lamp','friendly','product','working',1), 'progress acknowledgements should rotate')
  assert.equal(progressFlowHint('hi there',null),null)
  assert.equal(progressFlowHint('Who is your head chef?',null),null)
  assert.equal(progressFlowHint('Who is your head chef?','booking-123'),null,'an active flow must not turn an unrelated RAG question into staged flow copy')
  assert.equal(progressFlowHint('I want to reserve a table',null),'booking')
  assert.equal(progressFlowHint('Where is my order?',null),'support')
  assert.equal(progressFlowHint('Show me your products',null),'product')
  assert.match(buildFlowActionAcknowledgement({domain:'product',kind:'payment',value:'direct_upi',label:'UPI'},'friendly'),/payment/i)
  assert.doesNotMatch(buildFlowActionAcknowledgement({domain:'product',kind:'payment',value:'direct_upi',label:'UPI'},'friendly'),/catalogue/i)
  assert.match(buildFlowActionAcknowledgement({domain:'product',kind:'cancel',value:'cancel'},'friendly'),/cancel|closing/i)
  assert.doesNotMatch(buildFlowActionAcknowledgement({domain:'product',kind:'cancel',value:'cancel'},'friendly'),/choice|cart.*look/i)
  assert.match(widgetSource, /\},1200\)/, 'flow acknowledgements should appear after a 1.2 second typing interval')

  const geminiSource = fs.readFileSync(path.join(root, 'src/lib/gemini.ts'), 'utf8')
  assert.match(geminiSource, /CHAT_MODEL_START_TIMEOUT_MS/)
  assert.match(geminiSource, /gemini-3\.5-flash-lite/)
  assert.match(geminiSource, /anonymousVisitor/, 'placeholder visitor names must not be used for greetings')

  const { handleAuthoritativeFactQuestion } = loadTypeScript('src/lib/chat/factCardFlow.ts', {
    '@/lib/embeddings': { embed: async () => [0.1, 0.2] },
    '@/lib/redis': { redis: { get: async () => null } },
    '@/lib/supabase': { supabase: {
      from: () => ({ select: () => ({ eq: async () => ({ data: [{ dataset_id: 'dataset-1', datasets: null }], error: null }) }) }),
      rpc: async () => ({ data: [{ content: 'Catalog notes describe a warm ambient light.' }], error: null }),
    } },
    '@/lib/chat/catalogRepository': { searchBotCatalog: async () => [{ id: 'p1', name: 'Amber Lamp', sku: 'LAMP-1', price: 1200, currency: 'INR', available_quantity: 4, attributes: { allergens: ['peanut'], allergen_free: ['dairy'] } }] },
    '@/lib/chat/flowRevision': { currentFlowRevision: async () => 0 },
  })
  const facts = await handleAuthoritativeFactQuestion({ clientId: 'client-1', botId: 'bot-1', sessionId: 'session-1', text: 'Is Amber Lamp in stock and what is the price?' })
  assert.match(facts.answer, /INR 1200\.00/)
  assert.match(facts.answer, /In stock \(4 available\)/)
  assert.equal(facts.messages[1].type, 'product_grid')
  const allergens = await handleAuthoritativeFactQuestion({ clientId: 'client-1', botId: 'bot-1', sessionId: 'session-1', text: 'Does Amber Lamp contain peanut, dairy, or sesame?' })
  assert.match(allergens.answer, /peanut: Present/)
  assert.match(allergens.answer, /dairy: Absent/)
  assert.match(allergens.answer, /sesame: Unknown \/ Not specified/)

  console.log('PASS: request-local dependency deduplication, timing, strict flow-action validation and scope matching')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
