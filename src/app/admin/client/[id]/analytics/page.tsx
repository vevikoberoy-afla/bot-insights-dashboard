'use client'

import { useEffect, useState, use } from 'react';

interface Stats {
  pageviews: { value: number; prev: number }
  visitors: { value: number; prev: number }
}

export default function ClientAnalytics(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [stats, setStats] = useState<Stats | null>(null)
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/analytics/traffic?clientId=${params.id}`)
      .then(res => res.json())
      .then(data => {
        setStats(data.stats)
        setSeries(data.series || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [params.id])

  if (loading) {
    return <div className="p-8 text-gray-500">Loading analytics...</div>
  }

  if (!stats) {
    return <div className="p-8 text-gray-500">No analytics data available for this client. Make sure their website is configured.</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Traffic (Last 7 Days)</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Pageviews</p>
          <p className="text-4xl font-bold text-gray-900 mt-2">{stats.pageviews.value}</p>
        </div>
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Unique Visitors</p>
          <p className="text-4xl font-bold text-gray-900 mt-2">{stats.visitors.value}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm h-64 flex flex-col justify-end relative">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide absolute top-6 left-6">Pageviews Trend</p>
        {series.length > 0 ? (
          <div className="flex items-end gap-2 h-40 mt-10">
            {series.map((day, i) => {
              const maxVal = Math.max(...series.map(s => s.value), 1)
              const height = (day.value / maxVal) * 100
              return (
                <div key={i} className="flex-1 flex flex-col justify-end items-center group">
                  <div 
                    className="w-full bg-blue-500 rounded-t-sm transition-all group-hover:bg-blue-600"
                    style={{ height: `${height}%` }}
                    title={`${day.date}: ${day.value} views`}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No trend data available</div>
        )}
      </div>
    </div>
  )
}
