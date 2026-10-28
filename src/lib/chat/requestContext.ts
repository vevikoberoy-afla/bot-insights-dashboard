import { performance } from 'node:perf_hooks'
import type { BotCommerceConfig } from '@/lib/botCommerceConfig'
import { getBotCommerceConfig } from '@/lib/botCommerceConfig'
import type { Entitlements } from '@/lib/saas/entitlements'
import { getEffectiveEntitlements } from '@/lib/saas/entitlements'

type Loader<T> = () => Promise<T>

/** Request-local dependency cache. Never retain this object between requests. */
export class ChatRequestContext {
  private readonly pending = new Map<string, Promise<unknown>>()
  private entitlementPromise?: Promise<Entitlements>
  private commerceConfigPromise?: Promise<BotCommerceConfig>
  readonly timings: Record<string, number> = {}

  constructor(
    readonly clientId: string,
    readonly botId: string,
    readonly sessionId: string,
    initialEntitlements?: Entitlements,
  ) {
    if (initialEntitlements) this.entitlementPromise = Promise.resolve(initialEntitlements)
  }

  memo<T>(key: string, loader: Loader<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing as Promise<T>
    const startedAt = performance.now()
    const promise = loader().finally(() => {
      this.timings[key] = Math.max(0, Math.round(performance.now() - startedAt))
    })
    this.pending.set(key, promise)
    return promise
  }

  getEntitlements() {
    if (!this.entitlementPromise) {
      this.entitlementPromise = this.memo('entitlements', () => getEffectiveEntitlements(this.clientId))
    }
    return this.entitlementPromise
  }

  getBotCommerceConfig() {
    if (!this.commerceConfigPromise) {
      this.commerceConfigPromise = this.memo('bot-config', async () =>
        getBotCommerceConfig(this.clientId, this.botId, await this.getEntitlements()),
      )
    }
    return this.commerceConfigPromise
  }

  serverTiming() {
    return Object.entries(this.timings)
      .map(([name, duration]) => `${name.replace(/[^a-z0-9_-]/gi, '_')};dur=${duration}`)
      .join(', ')
  }
}
