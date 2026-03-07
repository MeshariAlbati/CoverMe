export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // Convert file to buffer and extract text
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let rawText = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const pdfData = await pdfParse(buffer)
      rawText = pdfData.text
    } catch {
      return NextResponse.json({ error: 'Failed to parse PDF. Please ensure the file is not password protected.' }, { status: 400 })
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from PDF. The file may be scanned or image-based.' }, { status: 400 })
    }

    // Call Claude to extract structured profile data
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a CV parsing expert. Extract the following fields from this CV text and return ONLY valid JSON with no markdown, no explanation, just the raw JSON object.

If a field is not found, use null for strings or empty arrays for arrays.

Return this exact structure:
{
  "full_name": "",
  "email": "",
  "phone": "",
  "linkedin_url": "",
  "location": "",
  "job_title": "",
  "years_of_experience": 0,
  "skills": [],
  "education": [{"degree": "", "institution": "", "year": ""}],
  "work_experience": [{"title": "", "company": "", "duration": "", "highlights": []}],
  "certifications": [],
  "languages": []
}

For years_of_experience, calculate based on work history dates. Return a number only.
For job_title, use the most recent or current position.
For skills, extract all mentioned technical and soft skills as an array of strings.
For education.year, use graduation year as a string.
For work_experience.highlights, extract key achievements and responsibilities as an array of strings.

CV TEXT:
${rawText.slice(0, 15000)}`,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from AI' }, { status: 500 })
    }

    let extracted
    try {
      const text = content.text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      extracted = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI extraction response' }, { status: 500 })
    }

    return NextResponse.json({
      extracted,
      raw_cv_text: rawText.slice(0, 50000),
    })
  } catch (error) {
    console.error('CV extraction error:', error)
    return NextResponse.json({ error: 'Internal server error during CV extraction' }, { status: 500 })
  }
}
