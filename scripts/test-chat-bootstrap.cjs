const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')

function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(id => id in mocks ? mocks[id] : require(id), module, module.exports)
  return module.exports
}

async function main() {
  const timeout = load('src/lib/utils/withTimeout.ts')
  let requests = 0, hang = false, missing = false, foreign = false
  const query = {
    select(columns) { assert.match(columns, /contacts\(.*bots\(/); return this },
    eq() { return this },
    async maybeSingle() { return { data: missing ? null : {
      mode: 'human', contacts: {id:'contact',client_id:foreign?'other':'tenant',name:'Website Visitor',email:null,phone:null},
      bots: {id:'bot',client_id:'tenant',bot_flow:{flow_sections:{ask_name:true}}},
    }, error:null } },
  }
  const { loadChatBootstrap, loadChatLeadState } = load('src/lib/chat/bootstrap.ts', {
    '@/lib/botJourney':load('src/lib/botJourney.ts'),
    '@/lib/supabase': {supabase:{from(table) { assert.equal(table,'sessions'); requests++; return query }}},
    '@/lib/redis': {redis:{mget: (...keys) => {
      assert.ok(keys.length === 5 || keys.length === 6)
      return hang ? new Promise(()=>{}) : Promise.resolve(keys.map((_,index)=>[null,false,0,null,[],Array(768).fill(.01)][index]))
    }}},
    '@/lib/utils/withTimeout': timeout,
    '@/lib/utils': {isUUID:()=>false},
  })
  const result = await loadChatBootstrap('tenant','bot','session123')
  assert.equal(requests,1)
  assert.equal(result.contact.hydrated,true)
  assert.equal(result.contact.email,null)
  assert.equal(result.session.mode,'human')
  assert.equal(result.botContext.dataCollectionConfig.askName,true)
  assert.equal(result.timings.boot_contact,0)
  const combinedLeadAndEmbedding=await loadChatLeadState('session123','embed_cache:test')
  assert.equal(combinedLeadAndEmbedding.length,6)
  assert.equal(combinedLeadAndEmbedding[5].length,768)
  hang=true
  const started=performance.now()
  const degraded=await loadChatBootstrap('tenant','bot','session123')
  assert.equal(degraded.leadState[1],true,'unknown consent must suppress lead prompts')
  assert.ok(performance.now()-started<1000,'Redis must not stall bootstrap indefinitely')
  hang=false; missing=true
  await assert.rejects(()=>loadChatBootstrap('tenant','bot','session123'),/verified/)
  missing=false; foreign=true
  await assert.rejects(()=>loadChatBootstrap('tenant','bot','session123'),/scope/)

  let reads=0
  const cache = load('src/lib/chat/answerCache.ts',{
    '@/lib/boundedCache':load('src/lib/boundedCache.ts'),
    '@/lib/utils/withTimeout':timeout,
    '@/lib/redis':{redis:{get:async()=>{reads++;return null},set:async()=>{}}},
  })
  const input={clientId:'tenant',botId:'bot',sessionId:'session',question:'What is the price?',history:[],runtime:{},contact:{}}
  const key=cache.pureAnswerKey(input)
  assert.equal(key,cache.pureAnswerKey({...input,history:[{role:'user',content:input.question},{role:'assistant',content:'Answer'}]}))
  for(const change of [{sessionId:'other'},{clientId:'other'},{botId:'other'},{runtime:{changed:true}},{contact:{email:'new'}},{question:'What is the price of 2?'},{history:[{role:'user',content:'A different subject'}]}]) {
    assert.notEqual(key,cache.pureAnswerKey({...input,...change}))
  }
  cache.rememberPureAnswer(key,{answer:'Pure answer',source_url:null})
  assert.equal((await cache.readPureAnswer(key)).answer,'Pure answer')
  assert.equal(reads,0,'immediate repeat must hit bounded local cache')
  assert.equal(cache.appendScheduledLeadPrompt('Answer','Your name?'),'Answer\n\nYour name?')
  assert.equal(cache.appendScheduledLeadPrompt('Answer'), 'Answer')
  assert.equal(cache.appendScheduledLeadPrompt('I do not have that information','Your name?'),'I do not have that information')
  assert.equal(cache.appendScheduledLeadPrompt('[HANDOFF]','Your name?'),'[HANDOFF]')
  const sharedInput={...input,question:'Who is your head chef?',history:[]}
  assert.equal(cache.isStandaloneKnowledgeQuestion(sharedInput.question),true)
  assert.equal(cache.pureAnswerKey(sharedInput),cache.pureAnswerKey({...sharedInput,sessionId:'another-session',history:[{role:'user',content:'Earlier context'},{role:'assistant',content:'Earlier answer'}]}),'standalone knowledge answers should not be polluted by session history')
  assert.equal(cache.isStandaloneKnowledgeQuestion('Where is my order ORD-123?'),false)

  let usageConsumes=0,evalDecision=-1,usageFails=false,blockedWrites=0
  const usage=load('src/lib/saas/fastUsage.ts',{
    '@/lib/boundedCache':load('src/lib/boundedCache.ts'),
    '@/lib/redis':{redis:{
      eval:async()=>evalDecision,
      set:async(key)=>{if(String(key).endsWith(':blocked'))blockedWrites++},
      del:async()=>{},
    }},
    '@/lib/saas/entitlements':{consumeUsage:async()=>{usageConsumes++;if(usageFails)throw new Error('allowance reached');return{allowed:true,used:2,limit:100}}},
    '@/lib/utils/withTimeout':timeout,
  })
  const coldPermit=usage.reserveAiUsageFast('tenant',{period_start:'2026-10-01'})
  await coldPermit.ready
  await coldPermit.commit()
  assert.equal(usageConsumes,1,'the first permit should synchronize once and must not double consume')
  evalDecision=1
  const warmPermit=usage.reserveAiUsageFast('tenant',{period_start:'2026-10-01'})
  await warmPermit.ready
  assert.equal(usageConsumes,1,'a warm Redis permit must not block model startup on PostgreSQL')
  await warmPermit.commit()
  assert.equal(usageConsumes,2,'a warm permit must be durably written after the response')
  usageFails=true
  const rejectedCommit=usage.reserveAiUsageFast('tenant',{period_start:'2026-10-01'})
  await rejectedCommit.ready
  await assert.rejects(()=>rejectedCommit.commit(),/allowance reached/)
  assert.equal(blockedWrites,1,'a rejected durable write must stop further fast permits')

  const events=[]
  let denied=false, useTool=false
  const { generateAnswerStream, shouldAttachLiveDataTool }=load('src/lib/gemini.ts',{
    '@google/generative-ai': {
      SchemaType:{OBJECT:'object',STRING:'string'},
      GoogleGenerativeAI: class {
        getGenerativeModel(){return {startChat(){return {async sendMessageStream(){
          events.push('model')
          return {stream:(async function*(){yield {
            functionCalls:()=>useTool?[{args:{identifier:'example'}}]:[],text:()=> 'Grounded answer',
          }})()}
        }}}}}
      },
    },
    './datasource':{handleFetchLiveData:async()=> 'Live inventory'},
    './utils/withTimeout':timeout,
    './leadCapture/extractEntities':{shouldInjectExtractDirective:()=>false,parseExtractTag:text=>({cleanText:text})},
    '@/lib/saas/entitlements':{consumeUsage:async()=>{events.push('quota');if(denied)throw new Error('quota denied')}},
  })
  const params={clientId:'tenant',question:'Explain the service',history:[],knowledgeChunks:[]}
  assert.equal(shouldAttachLiveDataTool('Explain the service'),false)
  assert.equal(shouldAttachLiveDataTool('Track order ORD-123'),true)
  assert.equal(shouldAttachLiveDataTool('Track order ORD-123','Already resolved'),false)
  denied=true
  await assert.rejects(()=>generateAnswerStream(params),/quota denied/)
  assert.deepEqual(events,['quota'],'denied usage must never start a paid model call')
  denied=false;events.length=0
  const stream=await generateAnswerStream(params)
  let text=''
  for await(const part of stream.stream)text+=part
  assert.equal(text,'Grounded answer')
  assert.deepEqual(events,['quota','model'])
  assert.equal(stream.usedLiveData(),false)
  events.length=0
  const reserved=generateAnswerStream({...params,usageReservation:Promise.resolve().then(()=>events.push('reserved'))})
  const reservedStream=await reserved
  for await(const part of reservedStream.stream) { /* drain */ }
  assert.deepEqual(events,['reserved','model'],'a pre-reserved quota promise must not consume twice')
  useTool=true
  const live=await generateAnswerStream(params)
  for await(const part of live.stream) { /* drain tool follow-up */ }
  assert.equal(live.usedLiveData(),true,'live tool results must be excluded from pure answer cache')

  const db=new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE clients(id uuid PRIMARY KEY,context_id text);
      CREATE TABLE bots(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id));
      CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),name text,
        source_channel text,source_bot_id uuid,tags text[],custom_fields jsonb,opt_in_web boolean,opt_in_email boolean,
        opt_in_whatsapp boolean,opt_in_sms boolean,last_active_at timestamptz,updated_at timestamptz);
      CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),bot_id uuid REFERENCES bots(id),
        session_id text UNIQUE,contact_id uuid REFERENCES contacts(id),channel text,mode text);
      INSERT INTO clients VALUES('11111111-1111-4111-8111-111111111111','ctx1'),('22222222-2222-4222-8222-222222222222','ctx2');
      INSERT INTO bots VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');`)
    await db.exec(fs.readFileSync('supabase/096_fast_widget_bootstrap.sql','utf8'))
    const init=async(bot='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session='session123')=>(await db.query('SELECT init_widget_session_atomic($1,$2) AS result',[bot,session])).rows[0].result
    const first=await init()
    assert.equal(first.is_new_session,true)
    assert.equal(first.contact.opt_in_web,true)
    assert.equal(first.contact.opt_in_email,false)
    assert.equal(first.contact.opt_in_whatsapp,false)
    const again=await init()
    assert.equal(again.is_new_session,false)
    assert.equal(again.contact.id,first.contact.id)
    await db.exec("UPDATE sessions SET mode='human'")
    assert.equal((await init()).session.mode,'human')
    await assert.rejects(()=>init('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/SESSION_SCOPE_MISMATCH/)
    assert.equal(Number((await db.query('SELECT count(*) AS n FROM contacts')).rows[0].n),1)
    await assert.rejects(()=>init(undefined,'bad'),/INVALID_SESSION/)

    // The chat-turn RPC folds entitlements, session/contact, bot runtime,
    // linked datasets and exact FAQ into one tenant-scoped round trip.
    await db.exec(`
      ALTER TABLE bots ADD COLUMN system_prompt text;
      ALTER TABLE bots ADD COLUMN bot_tone text;
      ALTER TABLE bots ADD COLUMN tone text;
      ALTER TABLE bots ADD COLUMN response_length text;
      ALTER TABLE bots ADD COLUMN use_emojis boolean;
      ALTER TABLE bots ADD COLUMN bot_flow jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE bots ADD COLUMN vision_ai_enabled boolean DEFAULT false;
      ALTER TABLE bots ADD COLUMN updated_at timestamptz DEFAULT now();
      ALTER TABLE contacts ADD COLUMN email text;
      ALTER TABLE contacts ADD COLUMN phone text;
      CREATE TABLE datasets(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),active_from timestamptz,active_until timestamptz);
      CREATE TABLE bot_datasets(bot_id uuid REFERENCES bots(id),dataset_id uuid REFERENCES datasets(id));
      CREATE TABLE qa_pairs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),context_id text,question text,answer text,source_url text,created_at timestamptz DEFAULT now());
      CREATE OR REPLACE FUNCTION saas_entitlements(p_client_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS
        'SELECT jsonb_build_object(''runtime_allowed'',true,''workspace_id'',p_client_id)';
      INSERT INTO datasets VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',NULL,NULL);
      INSERT INTO bot_datasets VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
      INSERT INTO qa_pairs(context_id,question,answer,source_url) VALUES('ctx1','Opening hours?','Nine to five','https://example.test/hours');
      UPDATE bots SET system_prompt='Tenant prompt',bot_flow='{"flow_sections":{"ask_name":true}}'::jsonb;
    `)
    await db.exec(fs.readFileSync('supabase/097_simultaneous_chat_turn_context.sql','utf8'))
    const turn=(await db.query('SELECT load_chat_turn_context_atomic($1,$2,$3,$4) AS result',[
      '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','session123','Opening hours?',
    ])).rows[0].result
    assert.equal(turn.session.client_id,'11111111-1111-4111-8111-111111111111')
    assert.equal(turn.bot.system_prompt,'Tenant prompt')
    assert.deepEqual(turn.dataset_ids,['dddddddd-dddd-4ddd-8ddd-dddddddddddd'])
    assert.equal(turn.faq_match.answer,'Nine to five')
    await assert.rejects(()=>db.query('SELECT load_chat_turn_context_atomic($1,$2,$3,$4)',[
      '22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','session123','Opening hours?',
    ]),/SESSION_SCOPE_MISMATCH/)
    await db.exec('SET ROLE anon')
    await assert.rejects(()=>init(),/permission denied/)
    await assert.rejects(()=>db.query('SELECT load_chat_turn_context_atomic($1,$2,$3,$4)',[
      '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','session123','Opening hours?',
    ]),/permission denied/)
    await db.exec('RESET ROLE')
  } finally { await db.close() }
  console.log('PASS: joined bootstrap, degraded Redis consent safety, missing-session/tenant rejection, cache isolation and immediate hits, quota-before-model and tool-cache boundaries, atomic initialization/idempotence/consent/handoff/role boundaries')
}
main().catch(error=>{console.error(error);process.exitCode=1})
