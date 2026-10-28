import { NextRequest, NextResponse } from 'next/server'
import {requireWorkspace,saasError} from '@/lib/saas/context'

export async function GET(req: NextRequest) {
  try{
    await requireWorkspace(null,'campaigns')
    // TODO: Wire up to Dittofeed VM: GET http://<DITTOFEED_VM_IP>:5000/api/journeys
    
    // For now, return mock data since VM isn't connected yet
    const MOCK_JOURNEYS = [
        { id: 'j-1', name: 'Abandoned Cart Recovery', status: 'active',  enrolled: 342, completed: 198, conversion: '18%', created: '2026-08-01' },
        { id: 'j-2', name: 'New User Onboarding',      status: 'active',  enrolled: 891, completed: 652, conversion: '12%', created: '2026-07-15' },
        { id: 'j-3', name: 'Win-Back Lapsed Users',    status: 'paused',  enrolled: 124, completed: 41,  conversion: '6%',  created: '2026-08-10' },
        { id: 'j-4', name: 'VIP Loyalty Campaign',     status: 'draft',   enrolled: 0,   completed: 0,   conversion: '—',   created: '2026-08-27' },
    ]
    
    return NextResponse.json(MOCK_JOURNEYS)
  }catch(error){return saasError(error)}
}

export async function POST(req: NextRequest) {
    try {
        await requireWorkspace(null,'campaigns',true)
        const body = await req.json()
        // TODO: Wire up to Dittofeed VM: POST http://<DITTOFEED_VM_IP>:5000/api/journeys
        return NextResponse.json({ success: true, journey: body })
    } catch(error) {
        return saasError(error)
    }
}
