#!/usr/bin/env node
/**
 * telegram-poll.mjs — Local Telegram Polling Bridge
 * Polls Telegram getUpdates and forwards to your local Next.js webhook.
 * No ngrok needed.
 *
 * Setup:
 *   Add to .env.local:  TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
 *   Then run:           node scripts/telegram-poll.mjs
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* ok if missing */ }
}
loadEnv()

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const LOCAL_WEBHOOK = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/api/webhooks/telegram'
const POLL_TIMEOUT = 30

if (!BOT_TOKEN) {
  console.error('\n❌  TELEGRAM_BOT_TOKEN not set.')
  console.error('    Add to .env.local:  TELEGRAM_BOT_TOKEN=123456:ABC...\n')
  process.exit(1)
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

async function clearWebhook() {
  const r = await fetch(`${API}/deleteWebhook`)
  const d = await r.json()
  console.log(d.ok ? '✅  Webhook cleared — polling active' : '⚠️  Could not clear webhook: ' + d.description)
}

async function forward(update) {
  try {
    const r = await fetch(LOCAL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })
    if (!r.ok) console.warn(`⚠️   Local server ${r.status}`)
  } catch (e) {
    console.error('❌  Cannot reach local server:', e.message, '— is npm run dev running?')
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

let offset = 0
async function poll() {
  try {
    const r = await fetch(`${API}/getUpdates?timeout=${POLL_TIMEOUT}&offset=${offset}`)
    const d = await r.json()
    if (!d.ok) { console.error('Telegram error:', d.description); await sleep(5000); return }
    for (const u of d.result) {
      offset = u.update_id + 1
      const who = u.message?.from?.username || u.message?.from?.first_name || '?'
      const txt = u.message?.text || '[non-text]'
      console.log(`📨  [${new Date().toLocaleTimeString()}] @${who}: ${txt}`)
      await forward(u)
    }
  } catch (e) { console.error('Poll error:', e.message); await sleep(5000) }
}

console.log('\n🤖  Telegram Local Polling Bridge')
console.log(`    Token: ...${BOT_TOKEN.slice(-8)}`)
console.log(`    → Forwarding to: ${LOCAL_WEBHOOK}`)
console.log('    Ctrl+C to stop\n')

clearWebhook().then(async () => { while(true) await poll() })
