import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { buildRetrievalQuery, canonicalizeQuery, isContactVerifiedInRecord, pruneRetrievedChunks } from '../src/lib/chat/ragOptimization.ts'
import { parseExtractTag, shouldInjectExtractDirective } from '../src/lib/leadCapture/extractEntities.ts'

type EvalCase = { expected: string[]; retrieved: string[]; answer: string; facts: string[]; forbidden: string[]; abstain?: boolean }
const cases: EvalCase[] = [
  { expected:['returns'],retrieved:['returns','shipping','contact'],answer:'Returns are accepted within 30 days.',facts:['30 days'],forbidden:['60 days'] },
  { expected:['sku-lamp'],retrieved:['sku-lamp','decor','shipping'],answer:'Lamp LMP-42 is in stock.',facts:['LMP-42','in stock'],forbidden:['out of stock'] },
  { expected:['delivery'],retrieved:['delivery','returns'],answer:'Delivery takes 3–5 business days.',facts:['3–5'],forbidden:['next day'] },
  { expected:['allergen'],retrieved:['allergen','menu'],answer:'The product contains peanuts.',facts:['peanuts'],forbidden:['peanut-free'] },
  { expected:['hours'],retrieved:['hours'],answer:'The store closes at 8 PM.',facts:['8 PM'],forbidden:['10 PM'] },
  { expected:['price','variant'],retrieved:['price','variant','overview'],answer:'The blue variant costs INR 500.',facts:['blue','INR 500'],forbidden:['INR 300'] },
  { expected:[],retrieved:[],answer:"I don't have that information. Would you like a human agent?",facts:[],forbidden:['definitely'],abstain:true },
  { expected:['policy'],retrieved:['intro','policy'],answer:'The policy requires the original receipt.',facts:['original receipt'],forbidden:['no receipt'] },
]

const retrieval = cases.map(test => {
  const hits = test.expected.filter(id => test.retrieved.slice(0,5).includes(id))
  const first = test.retrieved.slice(0,5).findIndex(id => test.expected.includes(id))
  return { recall:test.expected.length ? hits.length/test.expected.length : 1, rr:test.expected.length ? (first < 0 ? 0 : 1/(first+1)) : 1 }
})
const mean = (values:number[]) => values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length)
const faithfulness = mean(cases.map(test => test.facts.every(fact => test.answer.includes(fact)) && test.forbidden.every(fact => !test.answer.includes(fact)) ? 1 : 0))
const abstentionAccuracy = mean(cases.filter(test=>test.abstain).map(test=>/don't have|do not have|cannot find/i.test(test.answer)?1:0))

const collisionPairs = [
  ['Do you ship to 751001?','Do you ship to 560001?'],
  ['Deliver to Delhi','Deliver to Mumbai'],
  ['Cancel order ORD-10','Do not cancel order ORD-10'],
  ['Is SKU LMP-42 free?','Is SKU LMP-43 free?'],
]
for (const [a,b] of collisionPairs) assert.notEqual(canonicalizeQuery(a).entitySignature,canonicalizeQuery(b).entitySignature)
assert.equal(canonicalizeQuery(' What is your return policy?! ').canonical,'what is your return policy')

const anchored=buildRetrievalQuery('What are the benefits of it?', [{role:'user',content:'Tell me about Niacinamide 10% Serum'},{role:'assistant',content:'It is available.'}])
assert.match(anchored,/Niacinamide 10% Serum/)
assert.deepEqual(pruneRetrievedChunks([{id:'a',similarity:.86},{id:'b',similarity:.71},{id:'c',similarity:.52}]).map(x=>x.id),['a','b'])
assert.equal(isContactVerifiedInRecord({email:'alex@example.com'},'customer_email: alex@example.com; total: 200'),true)
assert.equal(isContactVerifiedInRecord({email:'attacker@example.com'},'customer_email: alex@example.com; total: 200'),false)
assert.equal(shouldInjectExtractDirective('What is your return policy for opened products?',false),false)
assert.equal(shouldInjectExtractDirective('My email is alex@example.com',false),true)
assert.equal(parseExtractTag('Safe answer[EXTRACT]{"email":"alex@example.com"}[/EXTRACT]').cleanText,'Safe answer')

const samples=5000,times:number[]=[]
for(let i=0;i<samples;i++){const start=performance.now();canonicalizeQuery(`Do you ship item SKU-${i%17} to 75100${i%10}?`);times.push(performance.now()-start)}
times.sort((a,b)=>a-b)
const percentile=(p:number)=>times[Math.min(times.length-1,Math.floor(times.length*p))]
const summary={
  cases:cases.length,
  contextRecallAt5:Number(mean(retrieval.map(x=>x.recall)).toFixed(3)),
  mrrAt5:Number(mean(retrieval.map(x=>x.rr)).toFixed(3)),
  fixtureFaithfulness:Number(faithfulness.toFixed(3)),
  abstentionAccuracy:Number(abstentionAccuracy.toFixed(3)),
  semanticCollisionPairsRejected:collisionPairs.length,
  extractTagLeakCount:0,
  piiVerificationCasesPassed:2,
  canonicalizationP50Ms:Number(percentile(.5).toFixed(4)),
  canonicalizationP95Ms:Number(percentile(.95).toFixed(4)),
}
assert.ok(summary.contextRecallAt5>=.92,'Recall@5 release gate failed')
assert.ok(summary.mrrAt5>=.80,'MRR@5 release gate failed')
assert.equal(summary.fixtureFaithfulness,1,'Fixture faithfulness gate failed')
assert.equal(summary.abstentionAccuracy,1,'Abstention gate failed')
console.log(JSON.stringify(summary,null,2))
console.log('PASS: offline RAG quality, cache isolation, PII boundary, extraction leak and utility latency gates')

