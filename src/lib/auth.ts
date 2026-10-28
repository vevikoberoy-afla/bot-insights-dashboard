import { NextRequest } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function getAuthContext(req: NextRequest): Promise<{ authorized: boolean; organizationId?: string; userId?: string }> {
    // Compatibility guard for legacy routes. It now uses the same independently
    // verified JWT + active workspace membership authority as newer APIs.
    const actor = await getAuthenticatedWorkspaceUser(req)
    if (!actor) return { authorized: false }
    return { authorized: true, organizationId: actor.workspaceId, userId: actor.id }
}
