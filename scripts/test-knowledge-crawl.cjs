const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')
function load(file, mocks = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)(id => id in mocks ? mocks[id] : require(id), module, module.exports, ...Object.values(globals))
  return module.exports
}
async function main() {
  const policy = load('src/lib/knowledgeCrawlPolicy.ts')
  for (const path of ['/blogs/post', '/our-products/lamp', '/products', '/news', '/cart', '/login', '/page?product=lamp', '/%62log/story', '/assets/file.pdf']) assert.equal(policy.allowedKnowledgeUrl(`https://store.example${path}`), false, path)
  assert.equal(policy.allowedKnowledgeUrl('https://store.example/about'), true)
  assert.equal(policy.allowedKnowledgeUrl('https://other.example/about', 'https://store.example'), false)
  assert.equal(policy.normalizeKnowledgePurpose(' SUPPORT '), 'support')
  assert.throws(() => policy.normalizeKnowledgePurpose('invalid'))
  assert.throws(() => policy.selectKnowledgeUrls(['https://store.example/products'], 'https://store.example', 10))
  assert.throws(() => policy.selectKnowledgeUrls(['https://store.example/a', 'https://store.example/b'], 'https://store.example', 1))
  assert.deepEqual(policy.selectKnowledgeUrls(['https://store.example/a?utm_source=a', 'https://store.example/a'], 'https://store.example', 2), ['https://store.example/a'])

  const client = '00000000-0000-4000-8000-000000000001', dataset = '00000000-0000-4000-8000-000000000002', source = '00000000-0000-4000-8000-000000000003'
  const token = '00000000-0000-4000-8000-000000000004', otherToken = '00000000-0000-4000-8000-000000000005'
  const e = { features: { 'knowledge.enabled': true }, limits: { 'knowledge.crawl.pages.monthly': 3, 'knowledge.crawl.pages_per_job': 1, 'knowledge.crawl.max_depth': 0 }, operational_state: 'active', access_state: 'active', dashboard_write_allowed: true }
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE DOMAIN vector AS text;
      CREATE TABLE saas_plan_versions(code text,features jsonb DEFAULT '{}',limits jsonb DEFAULT '{}');
      INSERT INTO saas_plan_versions(code) VALUES('trial'),('growth'),('business'),('enterprise');
      CREATE TABLE saas_release_gates(key text PRIMARY KEY);
      CREATE TABLE saas_workspace_accounts(client_id uuid PRIMARY KEY,period_start timestamptz DEFAULT now(),access_state text DEFAULT 'active',entitlements jsonb);
      CREATE TABLE saas_usage_events(client_id uuid,meter text,operation text,amount bigint CHECK(amount>0),state text DEFAULT 'charged',created_at timestamptz DEFAULT now(),UNIQUE(client_id,meter,operation));
      CREATE TABLE datasets(id uuid PRIMARY KEY,client_id uuid,chunk_count int,status text,source_count int,updated_at timestamptz);
      CREATE TABLE dataset_sources(id uuid PRIMARY KEY,dataset_id uuid REFERENCES datasets(id),status text,error_msg text,chunk_count int DEFAULT 0);
      CREATE TABLE chunks(dataset_id uuid,dataset_source_id uuid,context_id text NOT NULL,text text,chunk_hash text,embedding vector,source_url text,title text,source_type text,active boolean);
      CREATE FUNCTION saas_entitlements(p_client uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT entitlements FROM saas_workspace_accounts WHERE client_id=p_client';`)
    await db.query('INSERT INTO saas_workspace_accounts(client_id,entitlements) VALUES($1,$2)', [client, e])
    await db.query('INSERT INTO datasets(id,client_id) VALUES($1,$2)', [dataset,client])
    await db.query("INSERT INTO dataset_sources(id,dataset_id,status) VALUES($1,$2,'processing')", [source,dataset])
    const migration = fs.readFileSync('supabase/105_knowledge_crawl_guardrails.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const trial = (await db.query("SELECT limits FROM saas_plan_versions WHERE code='trial'")).rows[0].limits
    assert.equal(trial['knowledge.crawl.pages.monthly'], 3)
    await db.query('SELECT knowledge_reserve_crawl($1,$2,1,$3)', [client,source,'single'])
    await assert.rejects(() => db.query('SELECT knowledge_reserve_crawl($1,$2,1,$3)', [client,source,'single']), /already submitted/)
    const otherSource = '00000000-0000-4000-8000-000000000006'
    await db.query("INSERT INTO dataset_sources(id,dataset_id,status) VALUES($1,$2,'processing')", [otherSource,dataset])
    await assert.rejects(() => db.query('SELECT knowledge_reserve_crawl($1,$2,2,$3)', [client,otherSource,'single']), /page limit/)
    await assert.rejects(() => db.query('SELECT knowledge_reserve_crawl($1,$2,1,$3)', [client,otherSource,'deep']), /mode is not enabled/)
    await assert.rejects(() => db.query('SELECT knowledge_reserve_crawl($1,$2,1,$3)', [client,token,'single']), /Source not found/)
    e.limits['knowledge.crawl.pages.monthly'] = 1
    await db.query('UPDATE saas_workspace_accounts SET entitlements=$1 WHERE client_id=$2', [e,client])
    await assert.rejects(() => db.query('SELECT knowledge_reserve_crawl($1,$2,1,$3)', [client,otherSource,'single']), /Monthly website page allowance/)
    await db.query("UPDATE dataset_sources SET crawl_state='{\"job_id\":\"job\"}' WHERE id=$1", [source])
    assert((await db.query('SELECT knowledge_claim_crawl($1,$2) AS claim', [source,token])).rows[0].claim)
    assert.equal((await db.query('SELECT knowledge_claim_crawl($1,$2) AS claim', [source,otherToken])).rows[0].claim, null)
    const chunk = {text:'Knowledge text',chunk_hash:'hash',embedding:'[0,1]',source_url:'https://store.example/about',title:'About'}
    assert.equal((await db.query('SELECT knowledge_commit_crawl($1,$2,$3,$4,true,NULL) AS ok', [source,otherToken,[chunk],{}])).rows[0].ok,false)
    assert.equal((await db.query('SELECT knowledge_commit_crawl($1,$2,$3,$4,true,NULL) AS ok', [source,token,[chunk,chunk],{seen:['https://store.example/about']}])).rows[0].ok,true)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM chunks')).rows[0].count,1)
    assert.equal((await db.query('SELECT status FROM dataset_sources WHERE id=$1',[source])).rows[0].status,'ready')
    assert.equal((await db.query('SELECT knowledge_commit_crawl($1,$2,$3,$4,true,NULL) AS ok', [source,token,[chunk],{}])).rows[0].ok,false)
  } finally { await db.close() }

  // Provider requests are mocked: no paid crawl credits or credentials are used.
  process.env.FIRECRAWL_API_KEY = 'test-key'
  let entitlements = { ...e, limits: { 'knowledge.crawl.pages.monthly': 3, 'knowledge.crawl.pages_per_job': 1 } }
  let saved, providerCalls = [], reserveFails = false, embeddingFails = false, commits = []
  let responseData = null
  const crawler = load('src/lib/knowledgeCrawler.ts', {
    '@/lib/knowledgeCrawlPolicy': policy,
    '@/lib/saas/entitlements': { getEffectiveEntitlements: async () => entitlements, dashboardWriteAllowed: current => current.dashboard_write_allowed },
    '@/lib/urlSecurity': {
      assertSafeOutboundUrl: async value => { if (value.includes('localhost')) throw Error('private'); return new URL(value) },
      safeOutboundFetchBuffer: async (url, options) => {
        const body = options.body ? JSON.parse(options.body) : null
        providerCalls.push({path:new URL(url).pathname,body})
        const data = responseData || { success:true,data:{markdown:'About our team and our helpful customer support policies.'.repeat(3),metadata:{sourceURL:'https://store.example/about'}} }
        return { response:{ok:true},buffer:Buffer.from(JSON.stringify(data)) }
      },
    },
    '@/lib/chunker': { chunkText: async text => text ? [text] : [] },
    '@/lib/embeddings': { hashText: text => text.slice(0,16), embedBatch: async texts => { if(embeddingFails) throw Error('embedding offline'); return texts.map(() => Array(768).fill(0)) } },
    '@/lib/supabase': { supabase: {
      from(table) {
        return { insert(value) { saved={id:source,...value};return this },update(value) { if(table==='dataset_sources')Object.assign(saved,value);return this },eq(){return this},select(){return this},single:async()=>({data:{...saved}}) }
      },
      async rpc(name,args) {
        if(name==='knowledge_reserve_crawl') return reserveFails?{error:{message:'Allowance reached'}}:{data:{allowed:true}}
        if(name==='knowledge_claim_crawl') return {data:structuredClone(saved)}
        if(name==='knowledge_commit_crawl') { commits.push(args);saved.crawl_state=args.p_state;saved.status=args.p_error?'error':args.p_done?'ready':'processing';return {data:true} }
        throw Error(name)
      },
    } },
  })
  await crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example/about',mode:'single',limit:999})
  assert.equal(providerCalls[0].path,'/v1/scrape')
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(commits.at(-1).p_done,true)
  assert.equal(commits.at(-1).p_chunks[0].source_url,'https://store.example/about')
  assert.equal(commits.at(-1).p_chunks[0].text.includes('support policies'),true)
  assert.equal('page' in saved.crawl_state,false,'single-page content should be removed from job metadata after ingestion')
  const before=providerCalls.length
  await assert.rejects(()=>crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example/about',mode:'deep'}),/not enabled/)
  await assert.rejects(()=>crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example/products/lamp'}),/suitable/)
  assert.equal(providerCalls.length,before)
  await assert.rejects(()=>crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://localhost/about'}),/public HTTPS/)
  reserveFails=true
  await assert.rejects(()=>crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example/about'}),/Allowance reached/)
  assert.equal(providerCalls.length,before,'quota refusal must happen before paid requests')
  reserveFails=false
  entitlements={...entitlements,features:{'knowledge.enabled':true,'knowledge.crawl.discovery':true,'knowledge.crawl.autonomous':true},limits:{'knowledge.crawl.pages.monthly':100,'knowledge.crawl.pages_per_job':5,'knowledge.crawl.max_depth':2}}
  responseData={success:true,links:['https://store.example/about','https://store.example/blog/story','https://store.example/products/lamp','https://foreign.example/about']}
  const discovered=await crawler.discoverKnowledgePages(client,'https://store.example')
  assert.deepEqual(discovered.pages,['https://store.example/','https://store.example/about'])
  responseData={success:true,id:'job'}
  await crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example',mode:'deep',limit:999,maxDepth:99})
  const deep=providerCalls.at(-1)
  assert.equal(deep.body.limit,5);assert.equal(deep.body.maxDepth,2)
  assert.equal(deep.body.allowExternalLinks,false)
  assert.deepEqual(deep.body.excludePaths,policy.CRAWL_EXCLUDE_PATHS)
  responseData={status:'completed',data:[{markdown:'Excluded content',metadata:{sourceURL:'https://store.example/products/lamp'}},{markdown:'Imported about page with useful company details.',metadata:{sourceURL:'https://store.example/about'}}]}
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(commits.at(-1).p_chunks.length,1)
  assert.equal(commits.at(-1).p_chunks[0].source_url,'https://store.example/about')
  responseData={success:true,id:'batch'}
  await crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example',mode:'selected',selected_urls:['https://store.example/about']})
  assert.equal(providerCalls.at(-1).path,'/v1/batch/scrape')
  responseData={status:'completed',data:[{markdown:'Useful page',metadata:{sourceURL:'https://store.example/about'}}]}
  embeddingFails=true
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(commits.at(-1).p_chunks.length,0)
  assert(commits.at(-1).p_error)
  assert.equal(saved.status,'error','embedding errors must not report successful imports')
  embeddingFails=false
  responseData={success:true,id:'paged'}
  await crawler.startKnowledgeCrawl(dataset,client,{source_ref:'https://store.example',mode:'deep'})
  responseData={status:'completed',next:'https://api.firecrawl.dev/v1/crawl/paged?skip=2',data:[
    {markdown:'Page one',metadata:{sourceURL:'https://store.example/about'}},
    {markdown:'Page two',metadata:{sourceURL:'https://store.example/contact'}},
  ]}
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(commits.at(-1).p_done,false)
  assert.equal(saved.crawl_state.cursor,undefined,'do not advance the provider cursor before ingesting all pages')
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(saved.crawl_state.seen.length,2)
  assert.match(saved.crawl_state.cursor,/skip=2/)
  responseData={status:'completed',data:[{markdown:'Last page',metadata:{sourceURL:'https://store.example/team'}}]}
  await crawler.pollKnowledgeCrawl(source)
  assert.equal(commits.at(-1).p_done,true)
  assert.equal(saved.crawl_state.seen.length,3)

  let updates
  const datasets=load('src/app/api/datasets/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    '@/lib/knowledgeCrawlPolicy':policy,
    '@/lib/requestAuth':{getAuthenticatedWorkspaceUser:async()=>({workspaceId:client})},
    '@/lib/supabase':{supabase:{from:()=>({update(value){updates=value;return this},eq(){return this},select(){return this},single:async()=>({data:{id:dataset,name:'Existing',...updates}})})}},
  })
  const changed=await datasets.PUT({json:async()=>({id:dataset,purpose:' SALES '})})
  assert.equal(changed.status,200);assert.equal(changed.body.purpose,'sales')
  assert.equal('name' in updates,false,'purpose-only updates must preserve the existing name')
  assert.equal((await datasets.PUT({json:async()=>({id:dataset,purpose:'invalid'})})).status,400)

  // Back -> change purpose -> continue must update the same saved dataset.
  let slots=[],cursor=0,wizardSaved,created,closed=false
  const calls=[]
  const react={useEffect(){},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value}]}}
  const Icon=()=>null, WebsitePanel=()=>null
  const Wizard=load('src/components/knowledge/AddKnowledgeBaseModal.tsx',{
    react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    'lucide-react':new Proxy({},{get:()=>Icon}),
    '@/components/knowledge/WebsiteCrawlPanel':{WebsiteCrawlPanel:WebsitePanel},
    '@/components/knowledge/DocumentUploadPanel':{DocumentUploadPanel:Icon},
    '@/lib/client/workspace':{activeWorkspaceId:()=>client},
  },{fetch:async(url,options)=>{
    calls.push({url,options})
    if(options?.body)wizardSaved={id:dataset,...JSON.parse(options.body),status:'ready',chunk_count:1}
    return{ok:true,json:async()=>wizardSaved}
  }}).AddKnowledgeBaseModal
  const render=()=>{cursor=0;return Wizard({clientId:client,onClose:()=>{closed=true},onCreated:value=>{created=value}})}
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node?.props?[node,...nodes(node.props.children)]:[]
  const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:node?.props?text(node.props.children):''
  const click=label=>nodes(render()).find(node=>node.type==='button'&&text(node)===label).props.onClick()
  nodes(render()).find(node=>node.type==='input'&&node.props.placeholder==='e.g. Product FAQ').props.onChange({target:{value:'Our knowledge'}})
  click('support')
  await click('Save & Continue')
  assert.equal(calls[0].options.method,'POST')
  assert.equal(JSON.parse(calls[0].options.body).purpose,'support')
  click('← Back')
  click('sales')
  await click('Save & Continue')
  assert.equal(calls[1].options.method,'PUT')
  assert.equal(JSON.parse(calls[1].options.body).id,dataset)
  assert.equal(JSON.parse(calls[1].options.body).purpose,'sales')
  nodes(render()).find(node=>node.type===WebsitePanel).props.onAdded({id:source,source_type:'website_crawl',status:'ready',chunk_count:1})
  click('Review')
  await click('Publish Knowledge Base')
  assert.equal(created.id,dataset);assert.equal(created.purpose,'sales')
  assert.equal(closed,false,'publish must not trigger a second conflicting navigation through onClose')
  console.log('PASS: knowledge purpose, crawl selection/exclusions, plan limits, provider requests, local polling, SQL quota/leases/atomic ingestion, and failure handling')
}
main().catch(error=>{console.error(error);process.exitCode=1})
