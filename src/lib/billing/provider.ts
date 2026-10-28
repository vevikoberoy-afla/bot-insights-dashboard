/** Manual subscriptions are live; money movement is deliberately not configured. */
export const billingProvider = {
  name: 'manual' as const,
  paymentsEnabled: false,
  async createCheckout(): Promise<never> { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  async createCustomerPortal(): Promise<never> { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  async refund(): Promise<never> { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
}
