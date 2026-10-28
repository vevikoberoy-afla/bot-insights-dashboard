import { z } from 'zod'

const flowInputSchema = z.object({
  kind: z.string().trim().min(1).max(48),
  value: z.unknown().optional(),
  label: z.string().max(500).optional(),
  flowId: z.string().max(160),
  stepId: z.string().max(160),
  silent: z.boolean().optional(),
  expectedRevision: z.number().int().min(0).max(1_000_000_000),
  actionId: z.string().trim().min(8).max(180),
}).strict()

export const flowActionRequestSchema = z.object({
  session_id: z.string().trim().min(8).max(180),
  flow_id: z.string().max(160).optional(),
  step_id: z.string().max(160).optional(),
  input: flowInputSchema,
  client_id: z.string().max(120).optional(),
  bot_client_id: z.string().max(120).optional(),
}).strict().superRefine((body, ctx) => {
  if (body.flow_id !== undefined && body.flow_id !== body.input.flowId) {
    ctx.addIssue({ code: 'custom', path: ['flow_id'], message: 'Flow identity does not match the action' })
  }
  if (body.step_id !== undefined && body.step_id !== body.input.stepId) {
    ctx.addIssue({ code: 'custom', path: ['step_id'], message: 'Step identity does not match the action' })
  }
})

export type FlowActionRequest = z.infer<typeof flowActionRequestSchema>

export function flowActionText(input: FlowActionRequest['input']) {
  if (input.kind === 'text' && typeof input.value === 'string') return input.value.slice(0, 500)
  if (input.label) return input.label.slice(0, 500)
  if (typeof input.value === 'string') return input.value.slice(0, 500)
  return input.kind
}
