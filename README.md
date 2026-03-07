# CoverMe — AI-Powered Cover Letter Generator

Generate highly personalized cover letters using a 4-agent AI pipeline: company research → skill matching → letter writing. Users can switch providers (`Claude` or `Groq`) from the UI.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Auth + PostgreSQL + Storage)
- **LangGraph** (multi-agent orchestration)
- **Claude API** / **Groq API** (provider switch)
- **Tavily API** (optional, for fresher Groq research context)

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL` — from your Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings (keep secret)
- `ANTHROPIC_API_KEY` — from console.anthropic.com

Optional (for tracing):
- `LANGCHAIN_API_KEY` — from smith.langchain.com

Optional (for provider routing and tuning):
- `LLM_PROVIDER` — default provider (`claude` or `groq`)
- `GROQ_API_KEY` — required when selecting Groq
- `TAVILY_API_KEY` — optional, improves Groq research freshness
- `ANTHROPIC_*_MODEL` / `GROQ_*_MODEL` — optional per-step model overrides

### 2. Database Setup

Run the SQL migration in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
```

This creates:
- `profiles` table with RLS policies
- `cover_letters` table with RLS policies
- `cvs` storage bucket with per-user access policies
- Auto-profile creation trigger on signup
- Updated_at trigger on profiles

### 3. Run

```bash
npm run dev
```

## User Flow

1. **Sign up** at `/signup`
2. **Upload CV** at `/profile` — AI auto-extracts your info
3. **Answer profiling questions** — tone, career intent, unique value, achievements
4. **Go to Dashboard** `/dashboard` — enter any company name
5. **Watch generation** — real-time pipeline: research → match → write
6. **View, copy, download, or regenerate** your cover letter

## Agent Pipeline

```
User Input (company name)
       ↓
Agent 2: Company Researcher
  - Claude: Anthropic web_search tool
  - Groq: Tavily search context + Groq synthesis
  - Returns: mission, culture, news, tech stack, growth areas
       ↓
Agent 3: Skill Matcher
  - Matches your profile to company needs
  - Identifies bridge stories and narrative arc
       ↓
Agent 4: Letter Writer
  - Writes polished, tone-matched cover letter
  - References specific company details
  - Avoids generic AI phrases
```

Agent 1 (CV Parser) runs separately at upload time.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/extract-cv` | POST | Upload PDF → extract profile data |
| `/api/generate-cover-letter` | POST | Run pipeline, stream progress via SSE |
| `/api/cover-letters` | GET | List user's cover letters |
| `/api/cover-letters/[id]` | GET/PATCH/DELETE | Manage individual letter |

## Key Features

- **Streaming UX** — SSE streams pipeline progress in real-time
- **Company research cache** — 7-day TTL to avoid redundant API calls
- **Rate limiting** — 10 generations per user per hour
- **Edit mode** — manually edit generated letters
- **Download** — export as .txt file
- **Feedback** — thumbs up/down on each letter
