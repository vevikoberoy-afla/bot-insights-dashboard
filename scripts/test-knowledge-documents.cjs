const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const {PGlite}=require('@electric-sql/pglite')
const {createRequire}=require('node:module')
const {spawnSync}=require('node:child_process')
const {EventEmitter}=require('node:events')
const path=require('node:path')
const Zip=createRequire(require.resolve('mammoth'))('jszip')
function load(file,mocks={},globals={}){
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  const module={exports:{}}
  const localRequire=Object.assign(id=>id in mocks?mocks[id]:require(id),{resolve:require.resolve})
  new Function('require','module','exports',...Object.keys(globals),output)(localRequire,module,module.exports,...Object.values(globals))
  return module.exports
}
function pdf(text='A safe document with helpful refund and customer support policies.'){
  const stream=`BT /F1 12 Tf 40 100 Td (${text}) Tj ET\n`
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`]
  let output='%PDF-1.4\n',offsets=[0]
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`})
  const start=Buffer.byteLength(output)
  output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(output)
}
async function docx(extra={}){
  const zip=new Zip()
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Safe Word document about refunds and support.</w:t></w:r></w:p></w:body></w:document>')
  for(const[name,content]of Object.entries(extra))zip.file(name,content)
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
}
async function main(){
  const entitlements={features:{'knowledge.enabled':true},limits:{},dashboard_write_allowed:true}
  const policy=load('src/lib/knowledge/documentPolicy.ts',{'@/lib/saas/entitlements':{getEffectiveEntitlements:async()=>entitlements,dashboardWriteAllowed:e=>e.dashboard_write_allowed}})
  assert.equal((await policy.documentPolicy('client')).maxFileMb,5)
  entitlements.limits['knowledge.documents.max_file_mb']=99
  assert.equal((await policy.documentPolicy('client')).maxFileMb,20)
  entitlements.limits['knowledge.documents.max_file_mb']=0
  assert.equal((await policy.documentPolicy('client')).maxBytes,0)
  entitlements.limits={}
  for(const name of ['payload.exe','../file.pdf','file.pdf:exe','bad\u0000.txt'])assert.throws(()=>policy.documentFilename(name))
  assert.equal(policy.documentFilename('Guide.MD').extension,'md')
  const release=policy.acquireDocumentImport();assert.throws(()=>policy.acquireDocumentImport(),/being checked/);release()

  // Exercise the actual resource-bounded child parser, not a mocked parser.
  delete process.env.CLAMAV_HOST
  const parser=load('src/lib/knowledge/documentParser.ts',{'@/lib/knowledge/documentPolicy':policy})
  for(const[extension,buffer]of [['txt',Buffer.from('Text support policy')],['md',Buffer.from('# Markdown guide\nReturn policy details.')],['csv',Buffer.from('name,policy\nShop,Refunds allowed')],['pdf',pdf()],['docx',await docx()]]){
    const result=await parser.parseQuarantinedDocument(buffer,extension)
    assert(result.text.length>5,`${extension} must produce readable text`)
    assert.equal(result.scanner,'structural-checks')
  }
  const hostile=[
    ['txt',Buffer.from('MZ executable disguised as text')],
    ['txt',Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')],
    ['md',Buffer.from([0xff,0x00,0xfe,0x00])],
    ['pdf',Buffer.from('%PDF-1.4\n1 0 obj << /Java#53cript (bad) >> endobj\n%%EOF')],
    ['pdf',Buffer.concat([pdf(),Buffer.from('MZ appended executable')])],
    ['docx',await docx({'word/vbaProject.bin':'macro'})],
    ['docx',await docx({'word/extra.xml':'A'.repeat(200000)})],
    ['docx',await docx({'word/evil.xml':'<!DOCTYPE test [<!ENTITY ex SYSTEM "file:///etc/passwd">]>'})],
    ['docx',await docx({'word/_rels/document.xml.rels':'<Relationships><Relationship Type="image" TargetMode="External" Target="file:///etc/passwd"/></Relationships>'})],
  ]
  for(const[extension,buffer]of hostile)await assert.rejects(()=>parser.parseQuarantinedDocument(buffer,extension),`${extension} hostile fixture must be refused`)
  const html=await parser.parseQuarantinedDocument(Buffer.from('<html><body><script>doNotIndex()</script><p>Published Google document content.</p></body></html>'),'html')
  assert(html.text.includes('Published Google'));assert(!html.text.includes('doNotIndex'))
  const sandbox=spawnSync(process.execPath,['--permission',`--allow-fs-read=${path.resolve('node_modules')}`,'--disallow-code-generation-from-strings','-e',`
    let file=false,child=false,evalBlocked=false;
    try{require('fs').readFileSync(${JSON.stringify(path.resolve('scripts/test-knowledge-documents.cjs'))})}catch(error){file=error.code==='ERR_ACCESS_DENIED'}
    try{require('child_process').execSync('true')}catch(error){child=error.code==='ERR_ACCESS_DENIED'}
    try{new Function('return 1')}catch{evalBlocked=true}
    process.stdout.write(JSON.stringify({file,child,evalBlocked}));
  `],{encoding:'utf8',env:{NODE_ENV:'test'},timeout:4000})
  assert.equal(sandbox.status,0,sandbox.stderr)
  assert.deepEqual(JSON.parse(sandbox.stdout),{file:true,child:true,evalBlocked:true})
  let verdict='stream: Eicar-Test-Signature FOUND\0'
  class Scanner extends EventEmitter{
    constructor(){super();process.nextTick(()=>this.emit('connect'))}
    write(data,callback){process.nextTick(()=>{callback?.();if(Buffer.isBuffer(data)&&data.length===4&&data.readUInt32BE()===0)this.emit('data',Buffer.from(verdict))});return true}
    destroy(){process.nextTick(()=>this.emit('close'))}
  }
  process.env.CLAMAV_HOST='private-scanner'
  const scanned=load('src/lib/knowledge/documentParser.ts',{'@/lib/knowledge/documentPolicy':policy,'node:net':{createConnection:()=>new Scanner()}})
  await assert.rejects(()=>scanned.parseQuarantinedDocument(Buffer.from('notes'),'txt'),/malware scanner/)
  verdict='stream: ERROR\0'
  await assert.rejects(()=>scanned.parseQuarantinedDocument(Buffer.from('notes'),'txt'),/could not complete/)
  verdict='stream: OK\0'
  assert.equal((await scanned.parseQuarantinedDocument(Buffer.from('Safe scanner test notes'),'txt')).scanner,'structural-checks+clamav')
  delete process.env.CLAMAV_HOST

  const outbound=load('src/lib/urlSecurity.ts')
  await assert.rejects(()=>outbound.safeOutboundFetchBuffer('https://public.example',{allowPublicRedirects:true,headers:{Authorization:'Bearer test'}}),/anonymous GET/)
  await assert.rejects(()=>outbound.safeOutboundFetchBuffer('https://public.example',{allowPublicRedirects:true,method:'POST'}),/anonymous GET/)

  let remote={status:200,contentType:'text/plain',text:'Public Google document with support details.'},calls=[]
  const links=load('src/lib/knowledge/documentLinks.ts',{
    '@/lib/knowledge/documentPolicy':policy,
    '@/lib/urlSecurity':{
      assertSafeOutboundUrl:async value=>{if(value.includes('localhost'))throw Error('private');return new URL(value)},
      safeOutboundFetchBuffer:async(url,options)=>{calls.push({url:String(url),options});return{response:{ok:remote.status===200,status:remote.status,url:String(url)},contentType:remote.contentType,buffer:Buffer.from(remote.text)}},
    },
  })
  const google=await links.fetchDocumentLink('https://docs.google.com/document/u/0/d/DOC_123/edit?usp=sharing',5*1024*1024)
  assert.equal(google.extension,'txt');assert.match(calls.at(-1).url,/document\/d\/DOC_123\/export\?format=txt/)
  assert.equal(calls.at(-1).options.allowPublicRedirects,true)
  assert.equal(calls.at(-1).options.maxBytes,5*1024*1024)
  assert.match(links.googleDocumentExport('https://docs.google.com/spreadsheets/d/SHEET_123/edit#gid=42').url,/gid=42/)
  assert.equal(links.googleDocumentExport('https://docs.google.com.evil.example/document/d/123/edit'),null)
  assert.equal(links.googleDocumentExport('https://docs.google.com/document/d/e/PUBLISHED/pub').extension,'html')
  assert.match(links.googleDocumentExport('https://drive.google.com/file/d/PUBLIC_FILE_ID/view').url,/drive.usercontent.google.com\/download/)
  assert.match(links.googleDocumentExport('https://docs.google.com/document/d/PUBLIC/edit?resourcekey=0-shared_key').url,/resourcekey=0-shared_key/)
  remote.status=403;await assert.rejects(()=>links.fetchDocumentLink('https://docs.google.com/document/d/PRIVATE/edit',5000),/Google did not allow access/)
  remote.status=200;remote.contentType='text/html';remote.text='<html>Sign in</html>'
  await assert.rejects(()=>links.fetchDocumentLink('https://docs.google.com/document/d/PRIVATE/edit',5000),/sign-in or access page/)
  await assert.rejects(()=>links.fetchDocumentLink('https://localhost/file.pdf',5000),/Private network/)

  // Upload request limits apply to actual bytes even without Content-Length.
  let actor={workspaceId:'client'},ingested=0
  const uploader=load('src/lib/knowledge/documentUpload.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    '@/lib/knowledge/documentPolicy':policy,
    '@/lib/ratelimit':{documentImportRateLimit:{limit:async()=>({success:true})}},
    '@/lib/requestAuth':{getAuthenticatedWorkspaceUser:async()=>actor,getAuthenticatedWorkspaceResource:async()=>actor},
    '@/lib/supabase':{supabase:{}},
    '@/lib/knowledge/documentIngestion':{ingestDocumentBuffer:async()=>{ingested++;return{source:{id:'source',status:'ready',chunk_count:1}}}},
  })
  const oversized=new Request('https://local/upload',{method:'POST',body:'123456'})
  await assert.rejects(()=>uploader.boundedRequestBuffer(oversized,5),/exceeds/)
  let decoded=false
  actor=null
  const denied=await uploader.handleDocumentUpload({headers:new Headers(),body:{getReader(){decoded=true;throw Error('should not read')}}},'dataset')
  assert.equal(denied.status,403);assert.equal(decoded,false)
  actor={workspaceId:'client'}
  const form=new FormData();form.append('files',new File(['Safe notes'],'notes.md',{type:'text/plain'}))
  const uploaded=await uploader.handleDocumentUpload(new Request('https://local/upload',{method:'POST',body:form}),'dataset')
  assert.equal(uploaded.status,201);assert.equal(ingested,1)
  const bad=new FormData();bad.append('files',new File(['exe'],'virus.exe'))
  assert.equal((await uploader.handleDocumentUpload(new Request('https://local/upload',{method:'POST',body:bad}),'dataset')).status,400)
  assert.equal(ingested,1,'invalid files must not reach document ingestion')

  let embeddingCalls=0,sourceRow
  const ingest=load('src/lib/knowledge/documentIngestion.ts',{
    '@/lib/knowledge/documentPolicy':policy,
    '@/lib/knowledge/documentParser':{parseQuarantinedDocument:async()=>{throw new policy.DocumentImportError('Rejected malware fixture')}},
    '@/lib/embeddings':{embedBatch:async()=>{embeddingCalls++;return[]},hashText:()=>''},
    '@/lib/supabase':{supabase:{
      rpc:async name=>{assert.equal(name,'knowledge_start_document');return{data:{id:'source',document_state:{sha256:'hash',scan_status:'quarantine'}}}},
      from(){return{update(value){sourceRow=value;return this},eq(){return this},then(resolve){resolve({})}}},
    }},
  })
  await assert.rejects(()=>ingest.ingestDocumentBuffer({datasetId:'d',clientId:'c',filename:'bad.txt',extension:'txt',buffer:Buffer.from('bad')}),/Rejected malware/)
  assert.equal(embeddingCalls,0);assert.equal(sourceRow.document_state.scan_status,'rejected')
  assert.match(ingest.documentIndexingFailure({code:'42703'},'storage'),/106_secure_knowledge_documents.sql/)
  assert.match(ingest.documentIndexingFailure({status:429},'embedding'),/rate or usage limit/)
  assert.match(ingest.documentIndexingFailure({status:403},'embedding'),/credentials/)

  await sqlTests()
  console.log('PASS: valid PDF/TXT/DOCX/MD/CSV, isolated parser, hostile files, Google links, upload limits, pre-body auth, quarantine-before-embedding, and SQL access/leases/atomic ingestion')
}
async function sqlTests(){
  const db=new PGlite()
  const client='00000000-0000-4000-8000-000000000001',dataset='00000000-0000-4000-8000-000000000002',token='00000000-0000-4000-8000-000000000003',foreign='00000000-0000-4000-8000-000000000004'
  const e={features:{'knowledge.enabled':true},limits:{},operational_state:'active',access_state:'active',dashboard_write_allowed:true}
  try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE DOMAIN vector AS text;
      CREATE TABLE saas_plan_versions(limits jsonb DEFAULT '{}');INSERT INTO saas_plan_versions DEFAULT VALUES;
      CREATE TABLE saas_workspace_accounts(client_id uuid PRIMARY KEY,e jsonb);
      CREATE TABLE clients(id uuid PRIMARY KEY,context_id text);
      CREATE TABLE datasets(id uuid PRIMARY KEY,client_id uuid,source_url text,chunk_count int,status text,source_count int,updated_at timestamptz);
      CREATE TABLE dataset_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dataset_id uuid REFERENCES datasets(id),source_type text,source_name text,source_ref text,status text,error_msg text,chunk_count int DEFAULT 0,created_at timestamptz DEFAULT now(),crawl_lease uuid,crawl_lease_until timestamptz);
      CREATE TABLE chunks(dataset_id uuid,dataset_source_id uuid,context_id text NOT NULL,text text,chunk_hash text,embedding vector,source_url text,title text,source_type text,active boolean);
      CREATE FUNCTION saas_entitlements(p_client uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT e FROM saas_workspace_accounts WHERE client_id=p_client';`)
    await db.query('INSERT INTO saas_workspace_accounts VALUES($1,$2)',[client,e])
    await db.query('INSERT INTO clients VALUES($1,$2)',[client,'context'])
    await db.query('INSERT INTO datasets(id,client_id) VALUES($1,$2)',[dataset,client])
    const migration=fs.readFileSync('supabase/106_secure_knowledge_documents.sql','utf8')
    await db.exec(migration);await db.exec(migration)
    assert.equal((await db.query('SELECT limits FROM saas_plan_versions')).rows[0].limits['knowledge.documents.max_file_mb'],5)
    const start=(bytes=10,hash='a'.repeat(64),id=dataset)=>db.query("SELECT knowledge_start_document($1,$2,'guide.txt','file','guide.txt',$3,$4) AS source",[client,id,bytes,hash])
    await assert.rejects(()=>start(6*1024*1024),/file-size limit/)
    await assert.rejects(()=>start(10,'a'.repeat(64),foreign),/Knowledge base not found/)
    const source=(await start()).rows[0].source
    assert.equal(source.status,'pending');assert.equal(source.document_state.scan_status,'quarantine')
    assert.equal((await db.query('SELECT knowledge_claim_document($1,$2) AS claim',[source.id,token])).rows[0].claim,null,'quarantined sources cannot be claimed for embeddings')
    assert.equal((await start()).rows[0].source.duplicate,true)
    await db.query("SELECT knowledge_stage_document($1,$2,'Checked safe document text','structural-checks')",[source.id,'a'.repeat(64)])
    assert((await db.query('SELECT knowledge_claim_document($1,$2) AS claim',[source.id,token])).rows[0].claim)
    assert.equal((await db.query('SELECT knowledge_claim_document($1,$2) AS claim',[source.id,foreign])).rows[0].claim,null)
    const chunks=[{text:'Checked safe document text',chunk_hash:'hash',embedding:'[0,1]'}]
    assert.equal((await db.query('SELECT knowledge_commit_document($1,$2,$3,0,1,true) AS ok',[source.id,foreign,chunks])).rows[0].ok,false)
    await assert.rejects(()=>db.query('SELECT knowledge_commit_document($1,$2,$3,0,1,true)',[source.id,token,[]]),/Invalid document batch/)
    assert.equal((await db.query('SELECT knowledge_commit_document($1,$2,$3,0,1,true) AS ok',[source.id,token,chunks])).rows[0].ok,true)
    const completed=(await db.query('SELECT status,document_state FROM dataset_sources WHERE id=$1',[source.id])).rows[0]
    assert.equal(completed.status,'ready');assert.equal('text' in completed.document_state,false)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM chunks')).rows[0].count,1)
    await db.exec('SET ROLE authenticated')
    await assert.rejects(()=>db.query('SELECT knowledge_claim_document($1,$2)',[source.id,token]),/permission denied/)
    await db.exec('RESET ROLE')
    e.limits['knowledge.documents.max_file_mb']=0
    await db.query('UPDATE saas_workspace_accounts SET e=$1 WHERE client_id=$2',[e,client])
    await assert.rejects(()=>start(1,'b'.repeat(64)),/file-size limit/)
  }finally{await db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
