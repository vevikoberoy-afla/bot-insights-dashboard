import { NextRequest, NextResponse } from 'next/server'
import { getClientFromRequest } from '@/lib/api-auth'
import * as meta from '@/lib/meta'

export async function GET(req: NextRequest) {
  try {
    const client = await getClientFromRequest(req, true)
    if (!client || !client.meta_waba_id || !client.meta_access_token) {
      return NextResponse.json({ error: 'Unauthorized or Meta API config missing' }, { status: 401 })
    }

    const name = req.nextUrl.searchParams.get('name')
    const status = req.nextUrl.searchParams.get('status') || undefined

    if (name) {
      const result = await meta.getTemplateStatus(client.meta_waba_id, client.meta_access_token, name)
      return NextResponse.json(result)
    }

    const templates = await meta.getTemplates(client.meta_waba_id, client.meta_access_token, status)
    return NextResponse.json(templates)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = await getClientFromRequest(req, true)
    if (!client || !client.meta_waba_id || !client.meta_access_token) {
      return NextResponse.json({ error: 'Unauthorized or Meta API config missing' }, { status: 401 })
    }

    const body = await req.json()
    const newTemplate = await meta.createTemplate(client.meta_waba_id, client.meta_access_token, body)
    return NextResponse.json(newTemplate)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const client = await getClientFromRequest(req)
    if (!client || !client.meta_waba_id || !client.meta_access_token) {
      return NextResponse.json({ error: 'Unauthorized or Meta API config missing' }, { status: 401 })
    }

    const name = req.nextUrl.searchParams.get('name')
    if (!name) return NextResponse.json({ error: 'Template name required' }, { status: 400 })

    const result = await meta.deleteTemplate(client.meta_waba_id, client.meta_access_token, name)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
