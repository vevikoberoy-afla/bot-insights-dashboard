import { randomUUID } from 'node:crypto'

const origin = process.env.BENCHMARK_ORIGIN || 'http://127.0.0.1:3000'
const botId = process.env.BENCHMARK_BOT_ID || 'a1c24249-0bf4-4219-8b0a-cdfe6667f345'
const contextId = process.env.BENCHMARK_CONTEXT_ID || '992da1b3e4b94393a1175032d3ceb53d'
const questions = process.argv.slice(2)
const testQuestions = questions.length ? questions : [
  'What are your opening hours?',
  'What are your opening hours?',
  'Tell me briefly what services you provide.',
]

const round = value => Math.round(value)

async function initSession() {
  const sessionId = `latency_${randomUUID()}`
  const started = performance.now()
  const response = await fetch(`${origin}/api/chat/init`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, sessionId }),
  })
  const body = await response.json()
  if (!response.ok || !body.sessionToken) throw new Error(`init failed (${response.status}): ${JSON.stringify(body)}`)
  return { ...body, initMs: round(performance.now() - started), initTiming: response.headers.get('server-timing') }
}

async function ask(session, question, history = []) {
  const started = performance.now()
  const response = await fetch(`${origin}/api/chat?ctx=${encodeURIComponent(contextId)}&bot=${encodeURIComponent(botId)}&stream=true`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      'X-Widget-Session-Token': session.sessionToken,
    },
    body: JSON.stringify({ question, session_id: session.sessionId, history, active_flow_id: null }),
  })
  const headersMs = round(performance.now() - started)
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    throw new Error(`chat failed (${response.status}, ${headersMs}ms): ${await response.text()}`)
  }
  if (!contentType.includes('text/event-stream')) {
    const body = await response.json()
    return {
      question,
      responseType: 'json',
      headersMs,
      firstVisibleMs: headersMs,
      doneMs: round(performance.now() - started),
      serverTiming: response.headers.get('server-timing'),
      source: body.source,
      answerChars: String(body.answer || '').length,
      answer: String(body.answer || '').slice(0, 160),
    }
  }
  let buffer = '', answer = '', firstVisibleMs = null, doneMs = null
  let finalTiming = null, source = null
  const reader = response.body.getReader(), decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const line = frame.split('\n').find(item => item.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      if (event.delta) {
        answer += event.delta
        if (firstVisibleMs === null) firstVisibleMs = round(performance.now() - started)
      }
      if (event.done) {
        doneMs = round(performance.now() - started)
        finalTiming = event.serverTiming || null
        source = event.source || null
      }
    }
  }
  return {
    question,
    responseType: 'stream',
    headersMs,
    firstVisibleMs,
    doneMs: doneMs ?? round(performance.now() - started),
    serverTiming: finalTiming || response.headers.get('server-timing'),
    source,
    answerChars: answer.length,
    answer: answer.slice(0, 160),
  }
}

const session = await initSession()
const results = []
const history = []
for (const question of testQuestions) {
  const result = await ask(session, question, history)
  results.push(result)
  history.push({ role: 'user', content: question }, { role: 'assistant', content: result.answer })
}
console.log(JSON.stringify({ origin, initMs: session.initMs, initTiming: session.initTiming, isNewSession: session.isNewSession, results }, null, 2))
