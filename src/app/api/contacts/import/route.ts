import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Papa from 'papaparse'
import { safeOutboundFetchBuffer } from '@/lib/urlSecurity'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import {normalizeE164Phone} from '@/lib/phone'

// POST /api/contacts/import
export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'contacts',true)
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    let csvData = ''
    let clientId = ''
    
    // Check if it's form data (File upload) or JSON (Spreadsheet URL)
    const contentType = req.headers.get('content-type') || ''
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File
      clientId = actor.workspaceId
      
      if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Import files must be 10 MB or smaller' }, { status: 413 })
      csvData = await file.text()
    } else {
      const body = await req.json()
      clientId = actor.workspaceId
      const sheetUrl = body.url
      
      if (!sheetUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
      
      // Fetch the CSV data from the public Google Sheet URL
      const { response, buffer } = await safeOutboundFetchBuffer(sheetUrl, { maxBytes: 10 * 1024 * 1024, allowedTypes: ['text/csv', 'text/plain', 'application/csv'], signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Failed to fetch spreadsheet. Ensure it is published to the web as CSV.')
      csvData = buffer.toString('utf8')
    }

    // Parse the CSV
    const { data: parsedRows, errors } = Papa.parse(csvData, { header: true, skipEmptyLines: true, preview: 5000 })
    
    if (errors.length > 0) {
      console.warn('CSV Parse Warnings:', errors)
    }

    // Map common column headers dynamically
    const contactsToInsert = (parsedRows as any[]).map(row => {
      // Find the name column (case insensitive)
      const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('name'))
      const emailKey = Object.keys(row).find(k => k.toLowerCase().includes('email'))
      const phoneKey = Object.keys(row).find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('mobile'))
      
      const name = nameKey ? row[nameKey] : 'Unknown'
      const email = emailKey ? row[emailKey] : null
      const phone = phoneKey ? row[phoneKey] : null

      // Clean up phone (remove non-digits if needed, though often it's best to keep as is, but we'll trim)
      const normalized = normalizeE164Phone(phone),cleanPhone = normalized ? `+${normalized}` : null

      return {
        client_id: clientId,
        name: String(name).trim() || 'Unknown',
        email: email ? String(email).trim() : null,
        phone: cleanPhone || null,
        phone_e164: normalized,
        tags: ['imported'],
        source_channel: email ? 'email' : (cleanPhone ? 'whatsapp' : 'web'),
        capture_method: 'csv_import',
        custom_fields: {}
      }
    }).filter(c => c.name !== 'Unknown' || c.email || c.phone) // At least some identifier

    if (contactsToInsert.length === 0) {
      return NextResponse.json({ error: 'No valid contacts found in the CSV. Make sure you have Name, Email, or Phone headers.' }, { status: 400 })
    }

    // Insert into DB
    const { error: insertError } = await supabase
      .from('contacts')
      .insert(contactsToInsert)

    if (insertError) throw insertError

    return NextResponse.json({ success: true, count: contactsToInsert.length }, { status: 200 })
    
  } catch (err: any) {
    console.error('[Contact Import Error]', err.message)
    return NextResponse.json({ error: 'The contact import could not be completed.' }, { status: 400 })
  }
}
