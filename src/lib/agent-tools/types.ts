export interface ToolContext {
  clientId: string
  // Later: add callerType: 'human' | 'agent', callerId, etc.
}

export interface ToolResult<T> {
  ok: boolean
  data?: T
  error?: string
}
