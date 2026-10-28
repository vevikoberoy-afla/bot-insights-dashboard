const META_GRAPH_URL = 'https://graph.facebook.com/v19.0'

export async function getTemplates(wabaId: string, accessToken: string, status?: string) {
  const url = new URL(`${META_GRAPH_URL}/${wabaId}/message_templates`)
  if (status) url.searchParams.append('status', status)

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  
  if (!response.ok) throw new Error(`Meta GET /message_templates failed: ${response.statusText}`)
  return response.json()
}

export async function createTemplate(wabaId: string, accessToken: string, templateData: any) {
  const response = await fetch(`${META_GRAPH_URL}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(templateData)
  })
  
  if (!response.ok) throw new Error(`Meta POST /message_templates failed: ${response.statusText}`)
  return response.json()
}

export async function getTemplateStatus(wabaId: string, accessToken: string, templateName: string) {
  const url = new URL(`${META_GRAPH_URL}/${wabaId}/message_templates`)
  url.searchParams.append('name', templateName)

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  
  if (!response.ok) throw new Error(`Meta GET /message_templates status failed: ${response.statusText}`)
  return response.json()
}

export async function deleteTemplate(wabaId: string, accessToken: string, templateName: string) {
  const url = new URL(`${META_GRAPH_URL}/${wabaId}/message_templates`)
  url.searchParams.append('name', templateName)

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  
  if (!response.ok) throw new Error(`Meta DELETE /message_templates failed: ${response.statusText}`)
  return response.json()
}
