export interface DittofeedIdentifyParams {
  userId: string
  traits: {
    name?: string
    email?: string
    phone?: string
    segment?: string
    channel?: string
    clientId?: string
    createdAt?: string
    [key: string]: unknown
  }
}

export interface DittofeedTrackParams {
  userId: string
  event: string
  properties?: {
    campaignId?: string
    botId?: string
    message?: string
    channel?: string
    [key: string]: unknown
  }
}
