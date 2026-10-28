const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, mocks, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)(
    id => id in mocks ? mocks[id] : require(id), module, module.exports, ...Object.values(globals),
  )
  return module.exports
}

async function main() {
  let actor = { workspaceId: 'workspace' }, dbError = null, deleted = [{ id: 'bot' }], cacheFails = false
  const filters = [], evicted = []
  const route = load('src/app/api/bots/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/requestAuth': { getAuthenticatedWorkspaceUser: async (_req, module, write) => {
      assert.equal(module, 'bots'); assert.equal(write, true); return actor
    } },
    '@/lib/supabase': { supabase: { from: table => table === 'clients'
      ? { select() { return this }, eq() { return this }, single: async () => ({ data: { context_id: 'context' } }) }
      : { delete() { return this }, eq(column, value) { filters.push([column, value]); return this }, select: async () => ({ data: deleted, error: dbError }) }
    } },
    '@/lib/redis': { redis: { del: async key => { evicted.push(key); if (cacheFails) throw Error('offline') } } },
  }, { console: { warn() {} } })
  const request = id => ({ nextUrl: new URL(`https://local/api/bots${id ? `?id=${id}` : ''}`) })
  assert.equal((await route.DELETE(request())).status, 400)
  actor = null
  assert.equal((await route.DELETE(request('bot'))).status, 403)
  actor = { workspaceId: 'workspace' }
  const result = await route.DELETE(request('bot'))
  assert.equal(result.body.success, true)
  assert.deepEqual(filters, [['id', 'bot'], ['client_id', 'workspace']])
  assert(evicted.includes('widget_config:context:bot'))
  assert(evicted.includes('widget_config:global:bot'))
  assert(evicted.includes('bot_ctx:bot'))
  cacheFails = true
  assert.equal((await route.DELETE(request('bot'))).body.success, true, 'cache outage must not undo successful deletion')
  deleted = []
  assert.equal((await route.DELETE(request('foreign-bot'))).status, 404)
  dbError = { message: 'Delete failed' }
  assert.equal((await route.DELETE(request('bot'))).status, 500)

  // Exercise the actual page handler with hook state and an isolated browser cache.
  const initial = [{ id: 'bot', name: 'Bot', status: 'active' }]
  let cached = initial, slots = [], cursor = 0, fetchFails = false
  const notices = [], calls = []
  const react = {
    useState(initialValue) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initialValue
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index] },
    useEffect() {}, useDeferredValue: value => value, useMemo: fn => fn(),
  }
  const icon = () => null
  const page = load('src/app/(dashboard)/bots/all/page.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/client/workspace': { activeWorkspaceId: () => 'workspace' },
    '@/lib/client/featureDataCache': {
      readDashboardData: () => cached,
      writeDashboardData: (_url, value) => { cached = value },
      invalidateDashboardData: () => { cached = undefined },
      fetchDashboardData: async () => cached,
    },
    '@/components/shared/page-header': { PageHeader: icon },
    '@/components/ui/button': { Button: icon }, '@/components/ui/input': { Input: icon },
    'lucide-react': new Proxy({}, { get: () => icon }),
    'next/link': icon, '@/lib/utils': { cn: () => '' },
    sonner: { toast: { success: text => notices.push(text), error: text => notices.push(text) } },
  }, {
    confirm: () => true,
    fetch: async (url, options) => {
      calls.push({ url, options })
      return { ok: !fetchFails, json: async () => fetchFails ? { error: 'Denied' } : { success: true } }
    },
  }).default
  const render = () => { cursor = 0; return page() }
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : []
  async function deleteBot() {
    const tree = render()
    nodes(tree).find(node => node.props.onClick && node.props.children?.type === icon && node.props.className?.includes('opacity-0')).props.onClick()
    const menu = render()
    await nodes(menu).find(node => node.type === 'button' && node.props.children?.includes(' Delete')).props.onClick()
  }
  fetchFails = true
  await deleteBot()
  assert.equal(cached.length, 1, 'failed deletion must retain the cached bot')
  assert(notices.includes('Denied'))
  fetchFails = false
  await deleteBot()
  assert.deepEqual(cached, [], 'successful deletion must update the browser cache')
  assert.equal(calls[1].url, '/api/bots?id=bot')
  assert.equal(calls[1].options.method, 'DELETE')
  assert.equal(calls[1].options.headers['X-Workspace-Id'], 'workspace')
  slots = []
  assert(!nodes(render()).some(node => node.props.children === 'Bot'), 'remount must not resurrect deleted or sample bots')
  console.log('PASS: bot deletion persists, respects workspace access, handles failure, and clears stale UI data')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
