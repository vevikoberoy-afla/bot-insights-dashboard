/**
 * WhatsApp Cloud API utility library.
 * Handles sending text messages and marking messages as read via the Meta Graph API.
 */

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/**
 * Send a text message to a WhatsApp user.
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { 
          preview_url: false, 
          body: text 
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[WhatsApp Send Error]', data)
      return { success: false, error: data.error?.message || 'Unknown error' }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err: any) {
    console.error('[WhatsApp Send Exception]', err.message)
    return { success: false, error: err.message }
  }
}

export async function sendWhatsAppTemplate(phoneNumberId:string,accessToken:string,recipientPhone:string,templateName:string,values:string[],language='en_US') {
  try {
    const res=await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipientPhone,type:'template',template:{name:templateName,language:{code:language},components:[{type:'body',parameters:values.map(text=>({type:'text',text:String(text).slice(0,1024)}))}]}})})
    const data=await res.json();return res.ok?{success:true,messageId:data.messages?.[0]?.id}:{success:false,error:data.error?.message||'WhatsApp template failed'}
  }catch(error:any){return{success:false,error:error.message}}
}

/**
 * Mark an incoming WhatsApp message as read (shows blue ticks to sender).
 */
export async function markAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
  } catch (err: any) {
    console.error('[WhatsApp markAsRead Error]', err.message)
  }
}
