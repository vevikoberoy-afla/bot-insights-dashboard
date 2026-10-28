'use client'
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts'

export function MessagesBarChart() {
  const data = [
    { name: 'Mon', whatsapp: 400, sms: 240, email: 120, web: 350 },
    { name: 'Tue', whatsapp: 300, sms: 139, email: 220, web: 400 },
    { name: 'Wed', whatsapp: 200, sms: 980, email: 229, web: 200 },
    { name: 'Thu', whatsapp: 278, sms: 390, email: 200, web: 278 },
    { name: 'Fri', whatsapp: 189, sms: 480, email: 218, web: 189 },
    { name: 'Sat', whatsapp: 239, sms: 380, email: 250, web: 239 },
    { name: 'Sun', whatsapp: 349, sms: 430, email: 210, web: 349 },
  ]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RechartsBarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A8A8A4' }} dy={10} />
        <Tooltip
          cursor={{ fill: '#F9F9F8' }}
          contentStyle={{ borderRadius: '8px', border: '1px solid #E8E8E6', boxShadow: 'none' }}
        />
        <Bar dataKey="whatsapp" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={24} />
        <Bar dataKey="sms" fill="#BFDBFE" radius={[4, 4, 0, 0]} barSize={24} />
        <Bar dataKey="email" fill="#D97706" radius={[4, 4, 0, 0]} barSize={24} />
        <Bar dataKey="web" fill="#16A34A" radius={[4, 4, 0, 0]} barSize={24} />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
