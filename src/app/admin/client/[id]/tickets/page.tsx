'use client'

import { useEffect, useState, use } from 'react';

export default function TicketsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Basic fetch to show custom ticket UI is ready to be built on top of the DB
    fetch(`/api/tickets?client_id=${params.id}`)
      .then(res => res.json())
      .then(data => {
        setTickets(Array.isArray(data) ? data : (data.tickets || data.data || []))
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }, [params.id])

  return (
    <div className="w-full flex flex-col p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Support Tickets</h2>
          <p className="text-sm text-gray-500 mt-1">
            Custom internal ticketing system and analytics
          </p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Create Ticket
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center shadow-sm">
          <p className="text-gray-500 text-sm mb-4">No tickets have been created yet.</p>
          <div className="text-xs text-gray-400 bg-gray-50 p-4 rounded-lg inline-block text-left">
            <strong>System Ready:</strong> The <code>tickets</code> database table is fully provisioned. <br/>
            You can now build your custom internal ticketing UI and analytics here.
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700 border-b">
              <tr>
                <th className="px-6 py-3">Subject</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{t.subject}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      t.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 capitalize">{t.priority}</td>
                  <td className="px-6 py-4">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
