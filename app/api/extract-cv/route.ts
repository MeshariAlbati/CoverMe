export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getStageAnthropicModels,
  isAnthropicModelNotFoundError,
  isAnthropicRateLimitError,
  withAnthropicModelFallback,
} from '@/lib/anthropic-model'
import { resolveLlmProvider } from '@/lib/llm/provider'
import {
  chatWithGroq,
  getGroqStageModels,
  isGroqModelNotFoundError,
  isGroqRateLimitError,
} from '@/lib/llm/groq'
import { parseJsonFromModelText } from '@/lib/llm/json'

function getCvExtractionPrompt(rawText: string): string {
  return `You are a CV parsing expert. Extract the following fields from this CV text and return ONLY valid JSON with no markdown, no explanation, just the raw JSON object.

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
${rawText.slice(0, 8000)}`
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const providerInput = formData.get('provider')
    const llmProvider = resolveLlmProvider(typeof providerInput === 'string' ? providerInput : undefined)

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
      // pdf-parse v2 uses PDFParse class, not pdfParse(buffer) function.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse')
      const parser = new PDFParse({ data: buffer })

      try {
        const pdfData = await parser.getText()
        rawText = pdfData.text
      } finally {
        await parser.destroy()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      const isPasswordError = message.includes('password')

      if (isPasswordError) {
        return NextResponse.json({ error: 'Failed to parse PDF. Please ensure the file is not password protected.' }, { status: 400 })
      }

      return NextResponse.json({ error: 'Failed to parse PDF. Please try another PDF export or re-save the file and upload again.' }, { status: 400 })
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from PDF. The file may be scanned or image-based.' }, { status: 400 })
    }

    const prompt = getCvExtractionPrompt(rawText)
    let llmText = ''
    if (llmProvider === 'groq') {
      try {
        const groqCvModels = getGroqStageModels('GROQ_CV_MODEL', 'GROQ_CV_MODELS')
        const response = await chatWithGroq(
          [
            {
              role: 'system',
              content: 'You are a CV parsing expert. Return ONLY valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          1100,
          { models: groqCvModels }
        )
        llmText = response.text
      } catch (error) {
        if (isGroqModelNotFoundError(error)) {
          return NextResponse.json({
            error: 'The configured Groq model is unavailable. Set GROQ_CV_MODEL to an accessible model.',
          }, { status: 500 })
        }

        if (isGroqRateLimitError(error)) {
          return NextResponse.json({
            error: 'CV extraction is temporarily rate-limited. Please wait 30-60 seconds and try again.',
          }, { status: 429 })
        }

        throw error
      }
    } else {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      const cvModels = getStageAnthropicModels('ANTHROPIC_CV_MODEL', 'ANTHROPIC_CV_MODELS')
      let response
      try {
        response = await withAnthropicModelFallback(model =>
          anthropic.messages.create({
            model,
            max_tokens: 1200,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          })
        , { models: cvModels })
      } catch (error) {
        if (isAnthropicModelNotFoundError(error)) {
          return NextResponse.json({
            error: 'The configured Anthropic model is unavailable. Set ANTHROPIC_MODEL to an accessible model (e.g., claude-sonnet-4-6).',
          }, { status: 500 })
        }

        if (isAnthropicRateLimitError(error)) {
          return NextResponse.json({
            error: 'CV extraction is temporarily rate-limited. Please wait 30-60 seconds and try again.',
          }, { status: 429 })
        }

        throw error
      }

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response from AI' }, { status: 500 })
      }
      llmText = content.text
    }

    let extracted
    try {
      extracted = parseJsonFromModelText(llmText)
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
