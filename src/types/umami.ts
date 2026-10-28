export interface UmamiWebsite {
  id: string
  name: string
  domain: string
  createdAt: string
}

export interface UmamiStats {
  pageviews: { value: number; prev: number }
  visitors: { value: number; prev: number }
  visits: { value: number; prev: number }
  bounces: { value: number; prev: number }
  totaltime: { value: number; prev: number }
}

export interface UmamiPageviewSeries {
  date: string
  value: number
}

export interface CreateWebsiteParams {
  name: string
  domain: string
}
