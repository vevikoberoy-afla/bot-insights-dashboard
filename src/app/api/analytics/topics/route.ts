import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: client } = await supabase.from('clients').select('context_id').eq('id', actor.workspaceId).maybeSingle()
    if (!client?.context_id) return NextResponse.json({ error: 'Workspace context not found' }, { status: 404 })
    const contextId = client.context_id

    // 1. Fetch last 100 user questions
    const { data: messages, error } = await supabase
      .from('messages')
      .select('content')
      .eq('context_id', contextId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error fetching messages for topics:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ summary: "No questions asked yet." }, { status: 200 })
    }

    // 2. Format the payload for Groq
    const questions = messages.map(m => m.content).join('\\n')
    const prompt = `
You are an expert data analyst. Below is a list of the recent questions visitors have asked our customer service AI chatbot. 
Analyze these questions, cluster them by topic, and provide a single, concise sentence summarizing the most frequently asked topics and their approximate percentages.

Use this exact format: "This week your visitors most asked about: [topic 1] (X%), [topic 2] (Y%), [topic 3] (Z%)."

Do not include any other text or reasoning. Just the single sentence summary.

Questions:
${questions}
`

    // 3. Call Groq API
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_completion_tokens: 100,
        reasoning_effort: 'medium'
      })
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('Groq API error:', errText)
      return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
    }

    const data = await groqRes.json()
    const summary = data.choices?.[0]?.message?.content?.trim() || "Unable to generate summary."

    return NextResponse.json({ summary }, { status: 200 })

  } catch (err: any) {
    console.error('Topic modeling error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
