// Set by the dashboard shell after a server-verified membership lookup.
let workspaceId: string | null = null
export function setActiveWorkspace(id: string) { workspaceId = id }
export function activeWorkspaceId(fallback: string) { return workspaceId || fallback }
