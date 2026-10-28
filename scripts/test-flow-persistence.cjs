const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const calls = []
const pending = []
const db = { from(table) {
  let operation = 'select', payload
  const query = {
    select() { return query }, eq() { return query }, lt() { return query }, order() { return query }, limit() { return query }, maybeSingle() { return query },
    insert(value) { operation = 'insert'; payload = value; return query },
    update(value) { operation = 'update'; payload = value; return query },
    then(resolve, reject) {
      calls.push({ table, operation, payload })
      return new Promise(done => pending.push(() => done({ error: null, data:
        table === 'messages' && operation === 'select'
          ? [{ id: 'previous', metadata: { stepId: 'step-1', payload: { title: 'Original card' } } }]
          : table === 'messages' && operation === 'insert' ? [{ id: 'next' }] : null,
      }))).then(resolve, reject)
    },
  }
  return query
} }
const mocks = {
  '@/lib/supabase': { supabase: db, broadcastRealtime: async () => {} },
  '@/lib/realtime/channels': { chatRoomChannel: id => id, storeInboxChannel: id => id },
  '@/lib/redis': { redis: { del: async () => {} } },
}
const source = ts.transpileModule(fs.readFileSync('src/lib/chat/persistFlowTurn.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleObject = { exports: {} }
new Function('require', 'module', 'exports', source)(name => mocks[name] || require(name), moduleObject, moduleObject.exports)
const tick = () => new Promise(resolve => setImmediate(resolve))

async function main() {
  const work = moduleObject.exports.persistFlowTurn({
    contextId: 'context', clientId: 'workspace', botId: 'bot', sessionId: 'session', answer: 'Cart updated',
    verifiedSession: { id: 'session-row', session_id: 'session' },
    messages: [{ type: 'cart_card', payload: { title: 'Cart updated' } }],
    interaction: { flowId: 'order-1', stepId: 'step-1', value: 'checkout' },
  })
  await tick()
  assert.equal(calls.filter(call => call.table === 'sessions' && call.operation === 'select').length, 0)
  assert.equal(pending.length, 3, 'message insert, session update and prior-card lookup must start together')
  pending.splice(0).forEach(resolve => resolve())
  await tick()
  const lock = calls.find(call => call.table === 'messages' && call.operation === 'update')
  assert.equal(lock.payload.metadata.locked, true)
  assert.equal(lock.payload.metadata.payload.title, 'Original card')
  assert.equal(lock.payload.metadata.selectedValue, 'checkout')
  const update = calls.find(call => call.table === 'sessions' && call.operation === 'update')
  assert.ok(!('mode' in update.payload), 'persistence must preserve concurrent human handoff')
  pending.splice(0).forEach(resolve => resolve())
  await work
  console.log('PASS: concurrent durable flow persistence, verified-session reuse, card selection and handoff preservation')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
