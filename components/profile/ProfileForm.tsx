'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import type { FieldErrors, Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Loader2, Plus, X, CheckCircle2, Save, ChevronRight, ChevronLeft
} from 'lucide-react'
import type { LLMProvider, Profile } from '@/types'
import AppNavbar from '@/components/layout/AppNavbar'
import ProviderPicker from '@/components/ui/provider-picker'

const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
  github_url: z.string().optional(),
  location: z.string().optional(),
  job_title: z.string().min(1, 'Job title is required'),
  years_of_experience: z.coerce.number().min(0).max(50),
  skills: z.array(z.string()),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
  })),
  work_experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string(),
    highlights: z.array(z.string()),
  })),
  manual_projects: z.array(z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
  certifications: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  preferred_tone: z.enum(['formal', 'conversational', 'confident', 'balanced']),
  career_intent: z.enum(['same_field', 'career_change', 'promotion', 'freelance']),
  unique_value: z.string().min(1, 'Please share what makes you unique'),
  proudest_achievement: z.string().min(1, 'Please share your proudest achievement'),
  things_to_emphasize: z.string().optional(),
  things_to_downplay: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface Props {
  initialProfile: Profile | null
  userId: string
  userEmail: string
}

const CV_PROVIDER_STORAGE_KEY = 'coverme.cv-provider'

const TOTAL_STEPS = 9
const STEP_LABELS = [
  'Upload CV',
  'Personal Info',
  'Projects',
  'Skills',
  'Work Experience',
  'Education',
  'Preferences',
  'Optional Extras',
  'Review & Save',
]

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Name',
  email: 'Email',
  job_title: 'Current / Most Recent Title',
  years_of_experience: 'Years of Experience',
  preferred_tone: 'Preferred Tone',
  career_intent: 'Career Goal',
  unique_value: 'What makes you unique',
  proudest_achievement: 'Proudest professional achievement',
}

const REQUIRED_FIELD_STEPS: Record<string, number> = {
  full_name: 2,
  email: 2,
  job_title: 2,
  years_of_experience: 2,
  preferred_tone: 7,
  career_intent: 7,
  unique_value: 7,
  proudest_achievement: 7,
}

function collectErrorPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const paths: string[] = []

  if (typeof record.message === 'string' && prefix) {
    paths.push(prefix)
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'message' || key === 'type' || key === 'ref' || key === 'types') continue
    const nextPrefix = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(nested)) {
      nested.forEach((item, index) => {
        paths.push(...collectErrorPaths(item, `${nextPrefix}.${index}`))
      })
      continue
    }

    paths.push(...collectErrorPaths(nested, nextPrefix))
  }

  return paths
}

// Shared input styles
function DarkInput({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div>
      <input
        {...props}
        className="w-full h-9 px-3 rounded text-[14px] outline-none transition-all duration-200"
        style={{
          backgroundColor: '#1A1A1F',
          border: `1px solid ${error ? 'rgba(224, 108, 117, 0.4)' : '#222228'}`,
          color: '#EDEDEF',
        }}
        onFocus={e => {
          e.target.style.borderColor = '#E5C07B'
          e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? 'rgba(224, 108, 117, 0.4)' : '#222228'
          e.target.style.boxShadow = 'none'
        }}
      />
      {error && <p className="text-[12px] mt-1" style={{ color: '#E06C75' }}>{error}</p>}
    </div>
  )
}

function DarkTextarea({ error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <div>
      <textarea
        {...props}
        className="w-full px-3 py-2.5 rounded text-[14px] outline-none transition-all duration-200 resize-none"
        style={{
          backgroundColor: '#1A1A1F',
          border: `1px solid ${error ? 'rgba(224, 108, 117, 0.4)' : '#222228'}`,
          color: '#EDEDEF',
          minHeight: '100px',
        }}
        onFocus={e => {
          e.target.style.borderColor = '#E5C07B'
          e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? 'rgba(224, 108, 117, 0.4)' : '#222228'
          e.target.style.boxShadow = 'none'
        }}
      />
      {error && <p className="text-[12px] mt-1" style={{ color: '#E06C75' }}>{error}</p>}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#8A8A8E' }}>
      {children}
      {required && <span className="ml-1" style={{ color: '#E5C07B' }}>*</span>}
    </label>
  )
}

export default function ProfileForm({ initialProfile, userId, userEmail }: Props) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [cvProvider, setCvProvider] = useState<LLMProvider>('claude')
  const [cvUploading, setCvUploading] = useState(false)
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [rawCvText, setRawCvText] = useState<string>(initialProfile?.raw_cv_text || '')
  const [cvUrl, setCvUrl] = useState<string | null>(initialProfile?.cv_url || null)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveValidationError, setSaveValidationError] = useState<string | null>(null)
  const [showOptional, setShowOptional] = useState(false)
  const [certInput, setCertInput] = useState('')
  const [langInput, setLangInput] = useState('')
  const [githubImporting, setGithubImporting] = useState(false)
  const [githubImportMessage, setGithubImportMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, watch, getValues, setValue, control, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as Resolver<ProfileFormData>,
    defaultValues: {
      full_name: initialProfile?.full_name || '',
      email: initialProfile?.email || userEmail,
      phone: initialProfile?.phone || '',
      linkedin_url: initialProfile?.linkedin_url || '',
      github_url: initialProfile?.github_url || '',
      location: initialProfile?.location || '',
      job_title: initialProfile?.job_title || '',
      years_of_experience: initialProfile?.years_of_experience || 0,
      skills: initialProfile?.skills || [],
      education: initialProfile?.education?.length ? initialProfile.education : [{ degree: '', institution: '', year: '' }],
      work_experience: initialProfile?.work_experience?.length ? initialProfile.work_experience : [{ title: '', company: '', duration: '', highlights: [] }],
      manual_projects: (initialProfile?.manual_projects || []).map(project => ({
        name: project.name || '',
        description: project.description || '',
        url: project.url || '',
      })),
      certifications: initialProfile?.certifications || [],
      languages: initialProfile?.languages || [],
      preferred_tone: initialProfile?.preferred_tone || 'balanced',
      career_intent: initialProfile?.career_intent || 'same_field',
      unique_value: initialProfile?.unique_value || '',
      proudest_achievement: initialProfile?.proudest_achievement || '',
      things_to_emphasize: initialProfile?.things_to_emphasize || '',
      things_to_downplay: initialProfile?.things_to_downplay || '',
    },
  })

  const { fields: eduFields, append: appendEdu, remove: removeEdu } = useFieldArray({ control, name: 'education' })
  const { fields: expFields, append: appendExp, remove: removeExp } = useFieldArray({ control, name: 'work_experience' })
  const { fields: projectFields, append: appendProject, remove: removeProject, replace: replaceProjects } = useFieldArray({ control, name: 'manual_projects' })

  const skills = watch('skills')
  const certifications = watch('certifications') || []
  const languages = watch('languages') || []
  const preferred_tone = watch('preferred_tone')
  const career_intent = watch('career_intent')

  useEffect(() => {
    const stored = window.localStorage.getItem(CV_PROVIDER_STORAGE_KEY)
    if (stored === 'claude' || stored === 'groq') {
      setCvProvider(stored)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CV_PROVIDER_STORAGE_KEY, cvProvider)
  }, [cvProvider])

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      return
    }

    setCvUploading(true)
    setCvFileName(file.name)

    try {
      const supabase = createClient()
      const filePath = `${userId}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
      } else {
        setCvUrl(filePath)
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('provider', cvProvider)
      const response = await fetch('/api/extract-cv', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Extraction failed')
      }

      const { extracted, raw_cv_text } = await response.json()
      setRawCvText(raw_cv_text)

      if (extracted.full_name) setValue('full_name', extracted.full_name)
      if (extracted.email) setValue('email', extracted.email)
      if (extracted.phone) setValue('phone', extracted.phone)
      if (extracted.linkedin_url) setValue('linkedin_url', extracted.linkedin_url)
      if (extracted.github_url) setValue('github_url', extracted.github_url)
      if (extracted.location) setValue('location', extracted.location)
      if (extracted.job_title) setValue('job_title', extracted.job_title)
      if (extracted.years_of_experience) setValue('years_of_experience', extracted.years_of_experience)
      if (extracted.skills?.length) setValue('skills', extracted.skills)
      if (extracted.education?.length) setValue('education', extracted.education)
      if (extracted.work_experience?.length) setValue('work_experience', extracted.work_experience)
      if (extracted.certifications?.length) setValue('certifications', extracted.certifications)
      if (extracted.languages?.length) setValue('languages', extracted.languages)
    } catch (error) {
      console.error('CV processing error:', error)
      alert(error instanceof Error ? error.message : 'Failed to process CV')
    } finally {
      setCvUploading(false)
    }
  }, [cvProvider, userId, setValue])

  function addSkill() {
    const trimmed = skillInput.trim()
    if (trimmed && !skills.includes(trimmed)) {
      setValue('skills', [...skills, trimmed])
    }
    setSkillInput('')
  }

  function removeSkill(skill: string) {
    setValue('skills', skills.filter(s => s !== skill))
  }

  function addCert() {
    const trimmed = certInput.trim()
    if (trimmed && !certifications.includes(trimmed)) {
      setValue('certifications', [...certifications, trimmed])
    }
    setCertInput('')
  }

  function addLang() {
    const trimmed = langInput.trim()
    if (trimmed && !languages.includes(trimmed)) {
      setValue('languages', [...languages, trimmed])
    }
    setLangInput('')
  }

  async function importGithubProjects() {
    const githubUrl = (getValues('github_url') || '').trim()
    if (!githubUrl) {
      setGithubImportMessage('Please add a GitHub profile URL first.')
      return
    }

    setGithubImporting(true)
    setGithubImportMessage(null)

    try {
      const response = await fetch('/api/github-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: githubUrl }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to fetch GitHub projects')
      }

      const payload = await response.json() as {
        username: string
        projects: Array<{ name: string; description: string; url?: string | null }>
      }

      const imported = (payload.projects || [])
        .map(project => ({
          name: (project.name || '').trim(),
          description: (project.description || '').trim(),
          url: (project.url || '').trim(),
        }))
        .filter(project => project.name && project.description)

      if (imported.length === 0) {
        setGithubImportMessage('No usable projects were found on that profile.')
        return
      }

      const existing = (getValues('manual_projects') || [])
        .map(project => ({
          name: (project?.name || '').trim(),
          description: (project?.description || '').trim(),
          url: (project?.url || '').trim(),
        }))
        .filter(project => project.name && project.description)

      const seen = new Set<string>()
      const merged = [...existing, ...imported].filter(project => {
        const key = `${project.name.toLowerCase()}|${project.url.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      replaceProjects(merged)
      setGithubImportMessage(`Imported ${imported.length} projects from @${payload.username}.`)
    } catch (error) {
      setGithubImportMessage(error instanceof Error ? error.message : 'Failed to import projects')
    } finally {
      setGithubImporting(false)
    }
  }

  async function onSubmit(data: ProfileFormData) {
    setSaveValidationError(null)
    setSaving(true)
    const supabase = createClient()

    const manualProjects = (data.manual_projects || [])
      .map(project => ({
        name: (project.name || '').trim(),
        description: (project.description || '').trim(),
        url: (project.url || '').trim(),
      }))
      .filter(project => project.name.length > 0 && project.description.length > 0)
      .map(project => ({
        name: project.name,
        description: project.description,
        url: project.url || null,
      }))

    const profileData = {
      id: userId,
      ...data,
      manual_projects: manualProjects,
      cv_url: cvUrl,
      raw_cv_text: rawCvText,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' })

    setSaving(false)
    if (error) {
      console.error('Save error:', error)
      alert('Failed to save profile: ' + error.message)
    } else {
      setSaveSuccess(true)
      setTimeout(() => {
        setSaveSuccess(false)
        router.push('/dashboard')
      }, 2200)
    }
  }

  function onInvalidSubmit(formErrors: FieldErrors<ProfileFormData>) {
    const errorPaths = collectErrorPaths(formErrors)
    const fieldKeys = Array.from(new Set(errorPaths.map((path) => path.split('.')[0] || '')))
      .filter(Boolean)

    const requiredMissingKeys = fieldKeys.filter((key) => key in REQUIRED_FIELD_LABELS)
    const firstInvalidStep = requiredMissingKeys
      .map((key) => REQUIRED_FIELD_STEPS[key] || TOTAL_STEPS)
      .sort((a, b) => a - b)[0] || TOTAL_STEPS

    const missingLabels = requiredMissingKeys.map((key) => REQUIRED_FIELD_LABELS[key])
    const message = missingLabels.length > 0
      ? `Please complete required fields before saving: ${missingLabels.join(', ')}.`
      : 'Please complete all required questions before saving your profile.'

    setSaveValidationError(message)
    alert(message)

    if (currentStep !== firstInvalidStep) {
      setDirection(firstInvalidStep > currentStep ? 'forward' : 'back')
      setCurrentStep(firstInvalidStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  function goNext() {
    setSaveValidationError(null)
    setDirection('forward')
    setCurrentStep(s => Math.min(s + 1, TOTAL_STEPS))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setSaveValidationError(null)
    setDirection('back')
    setCurrentStep(s => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const progressPct = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100

  // ── Step content ────────────────────────────────────────────────────────────

  function renderStepContent() {
    switch (currentStep) {

      // Step 1: Upload CV
      case 1: return (
        <div>
          <StepHeading step={1} title="Upload your CV" subtitle="PDF only — we'll auto-fill everything below" />
          <div className="mb-4 flex items-center gap-3">
            <label className="text-[12px] font-mono tracking-wider uppercase" style={{ color: '#555559' }}>
              AI Provider
            </label>
            <ProviderPicker
              value={cvProvider}
              onChange={setCvProvider}
              disabled={cvUploading}
              allowClaude
            />
          </div>
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200"
            style={{
              borderColor: dragOver ? '#E5C07B' : cvFileName || initialProfile?.cv_url ? 'rgba(126, 198, 153, 0.4)' : '#222228',
              backgroundColor: dragOver ? 'rgba(229, 192, 123, 0.04)' : cvFileName || initialProfile?.cv_url ? 'rgba(126, 198, 153, 0.04)' : '#111113',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFileUpload(file)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            {cvUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-9 h-9 animate-spin" style={{ color: '#E5C07B' }} />
                <p className="text-[15px] font-medium" style={{ color: '#E5C07B' }}>Analyzing your CV...</p>
                <p className="text-[13px]" style={{ color: '#555559' }}>Extracting skills, experience, and education</p>
              </div>
            ) : cvFileName || initialProfile?.cv_url ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-9 h-9" style={{ color: '#7EC699' }} />
                <p className="text-[15px] font-medium" style={{ color: '#7EC699' }}>{cvFileName || 'CV uploaded'}</p>
                <p className="text-[13px]" style={{ color: '#555559' }}>Click to upload a different file</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-9 h-9" style={{ color: '#333338' }} />
                <p className="text-[15px] font-medium" style={{ color: '#8A8A8E' }}>Drag & drop or click to upload</p>
                <p className="text-[13px]" style={{ color: '#555559' }}>PDF only, max 10MB</p>
              </div>
            )}
          </div>
        </div>
      )

      // Step 2: Personal Info
      case 2: return (
        <div>
          <StepHeading step={2} title="Personal Information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Full Name</FieldLabel>
              <DarkInput {...register('full_name')} placeholder="Jane Smith" error={errors.full_name?.message} />
            </div>
            <div>
              <FieldLabel required>Email</FieldLabel>
              <DarkInput type="email" {...register('email')} placeholder="jane@example.com" error={errors.email?.message} />
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <DarkInput {...register('phone')} placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <DarkInput {...register('location')} placeholder="San Francisco, CA" />
            </div>
            <div>
              <FieldLabel>LinkedIn URL</FieldLabel>
              <DarkInput {...register('linkedin_url')} placeholder="linkedin.com/in/janesmith" />
            </div>
            <div>
              <FieldLabel required>Current / Most Recent Title</FieldLabel>
              <DarkInput {...register('job_title')} placeholder="Senior Software Engineer" error={errors.job_title?.message} />
            </div>
            <div>
              <FieldLabel required>Years of Experience</FieldLabel>
              <DarkInput type="number" min={0} max={50} {...register('years_of_experience')} className="w-24" />
            </div>
          </div>
        </div>
      )

      // Step 3: Projects
      case 3: return (
        <div>
          <StepHeading step={3} title="Projects" subtitle="Share your GitHub profile and add manual projects to strengthen your cover letters." />
          <div className="grid grid-cols-1 gap-5">
            <div>
              <FieldLabel>GitHub Profile URL</FieldLabel>
              <DarkInput {...register('github_url')} placeholder="github.com/janesmith" />
              <p className="text-[12px] mt-1" style={{ color: '#555559' }}>
                We read public repositories and use relevant projects in your letter.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={importGithubProjects}
                  disabled={githubImporting}
                  className="h-9 px-4 rounded border text-[13px] font-medium transition-all duration-200 flex items-center gap-2"
                  style={{
                    borderColor: '#E5C07B',
                    color: '#E5C07B',
                    opacity: githubImporting ? 0.7 : 1,
                    cursor: githubImporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {githubImporting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing...</>
                  ) : 'Import Projects'}
                </button>
                {githubImportMessage && (
                  <p className="text-[12px]" style={{ color: '#8A8A8E' }}>{githubImportMessage}</p>
                )}
              </div>
            </div>

            <div className="h-px" style={{ backgroundColor: '#1A1A1F' }} />

            <div>
              <FieldLabel>Manual Projects</FieldLabel>
              <p className="text-[12px] mb-3" style={{ color: '#555559' }}>
                Add important projects with description if they are missing from GitHub parsing.
              </p>
              <div className="space-y-3">
                {projectFields.map((field, index) => (
                  <div key={field.id} className="p-4 rounded-lg border relative" style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}>
                    <button
                      type="button"
                      onClick={() => removeProject(index)}
                      className="absolute top-3 right-3 transition-colors"
                      style={{ color: '#555559' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#E06C75')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <FieldLabel>Project Name</FieldLabel>
                        <DarkInput {...register(`manual_projects.${index}.name`)} placeholder="Distributed Payment Gateway" />
                      </div>
                      <div>
                        <FieldLabel>Project Description</FieldLabel>
                        <DarkTextarea
                          {...register(`manual_projects.${index}.description`)}
                          placeholder="Built a high-throughput payment service with retry logic and observability; reduced failed transactions by 22%."
                          style={{ minHeight: '90px' }}
                        />
                      </div>
                      <div>
                        <FieldLabel>Project URL (Optional)</FieldLabel>
                        <DarkInput {...register(`manual_projects.${index}.url`)} placeholder="https://github.com/username/project" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => appendProject({ name: '', description: '', url: '' })}
                className="mt-3 w-full h-9 rounded border text-[13px] flex items-center justify-center gap-2 transition-colors"
                style={{ borderColor: '#222228', color: '#555559', borderStyle: 'dashed' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#333338'; e.currentTarget.style.color = '#8A8A8E' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#222228'; e.currentTarget.style.color = '#555559' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add manual project
              </button>
            </div>
          </div>
        </div>
      )

      // Step 4: Skills
      case 4: return (
        <div>
          <StepHeading step={4} title="Skills" subtitle="Add or edit your skills — drag from CV or type manually" />
          <div className="flex gap-2 mb-4">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
              placeholder="Type a skill and press Enter"
              className="flex-1 h-9 px-3 rounded text-[14px] outline-none transition-all duration-200"
              style={{ backgroundColor: '#1A1A1F', border: '1px solid #222228', color: '#EDEDEF' }}
              onFocus={e => { e.target.style.borderColor = '#E5C07B'; e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)' }}
              onBlur={e => { e.target.style.borderColor = '#222228'; e.target.style.boxShadow = 'none' }}
            />
            <button
              type="button"
              onClick={addSkill}
              className="w-9 h-9 rounded border flex items-center justify-center transition-colors"
              style={{ borderColor: '#222228', color: '#8A8A8E' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#E5C07B')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#222228')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[36px]">
            {skills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[13px] border animate-tag-pop"
                style={{ backgroundColor: '#1A1A1F', borderColor: '#222228', color: '#8A8A8E' }}
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="transition-colors"
                  style={{ color: '#555559' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#E06C75')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {skills.length === 0 && (
              <p className="text-[13px]" style={{ color: '#555559' }}>No skills added yet</p>
            )}
          </div>
        </div>
      )

      // Step 5: Work Experience
      case 5: return (
        <div>
          <StepHeading step={5} title="Work Experience" />
          <div className="space-y-4">
            {expFields.map((field, index) => (
              <div key={field.id} className="p-4 rounded-lg border relative" style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}>
                {expFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeExp(index)}
                    className="absolute top-3 right-3 transition-colors"
                    style={{ color: '#555559' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#E06C75')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Job Title</FieldLabel>
                    <DarkInput {...register(`work_experience.${index}.title`)} placeholder="Software Engineer" />
                  </div>
                  <div>
                    <FieldLabel>Company</FieldLabel>
                    <DarkInput {...register(`work_experience.${index}.company`)} placeholder="Acme Corp" />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel>Duration</FieldLabel>
                    <DarkInput {...register(`work_experience.${index}.duration`)} placeholder="Jan 2022 – Present" />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => appendExp({ title: '', company: '', duration: '', highlights: [] })}
              className="w-full h-9 rounded border text-[13px] flex items-center justify-center gap-2 transition-colors"
              style={{ borderColor: '#222228', color: '#555559', borderStyle: 'dashed' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#333338'; e.currentTarget.style.color = '#8A8A8E' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#222228'; e.currentTarget.style.color = '#555559' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add position
            </button>
          </div>
        </div>
      )

      // Step 6: Education
      case 6: return (
        <div>
          <StepHeading step={6} title="Education" />
          <div className="space-y-4">
            {eduFields.map((field, index) => (
              <div key={field.id} className="p-4 rounded-lg border relative" style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}>
                {eduFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEdu(index)}
                    className="absolute top-3 right-3 transition-colors"
                    style={{ color: '#555559' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#E06C75')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <FieldLabel>Degree</FieldLabel>
                    <DarkInput {...register(`education.${index}.degree`)} placeholder="B.Sc. Computer Science" />
                  </div>
                  <div>
                    <FieldLabel>Institution</FieldLabel>
                    <DarkInput {...register(`education.${index}.institution`)} placeholder="MIT" />
                  </div>
                  <div>
                    <FieldLabel>Year</FieldLabel>
                    <DarkInput {...register(`education.${index}.year`)} placeholder="2022" />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => appendEdu({ degree: '', institution: '', year: '' })}
              className="w-full h-9 rounded border text-[13px] flex items-center justify-center gap-2 transition-colors"
              style={{ borderColor: '#222228', color: '#555559', borderStyle: 'dashed' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#333338'; e.currentTarget.style.color = '#8A8A8E' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#222228'; e.currentTarget.style.color = '#555559' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add degree
            </button>
          </div>
        </div>
      )

      // Step 7: Preferences
      case 7: return (
        <div>
          <StepHeading step={7} title="Your Preferences" subtitle="Help us write letters that sound like you" />
          <div className="space-y-7">
            <div>
              <FieldLabel required>Preferred Tone</FieldLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['formal', 'conversational', 'confident', 'balanced'] as const).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setValue('preferred_tone', tone)}
                    className="h-10 rounded border text-[13px] font-medium capitalize transition-all duration-150"
                    style={{
                      borderColor: preferred_tone === tone ? '#E5C07B' : '#222228',
                      backgroundColor: preferred_tone === tone ? 'rgba(229, 192, 123, 0.08)' : 'transparent',
                      color: preferred_tone === tone ? '#E5C07B' : '#8A8A8E',
                    }}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px" style={{ backgroundColor: '#1A1A1F' }} />

            <div>
              <FieldLabel required>Career Goal</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'same_field', label: 'Same field' },
                  { value: 'career_change', label: 'Career change' },
                  { value: 'promotion', label: 'Promotion level' },
                  { value: 'freelance', label: 'Freelance / contract' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('career_intent', value as ProfileFormData['career_intent'])}
                    className="h-10 rounded border text-[13px] font-medium transition-all duration-150"
                    style={{
                      borderColor: career_intent === value ? '#E5C07B' : '#222228',
                      backgroundColor: career_intent === value ? 'rgba(229, 192, 123, 0.08)' : 'transparent',
                      color: career_intent === value ? '#E5C07B' : '#8A8A8E',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px" style={{ backgroundColor: '#1A1A1F' }} />

            <div>
              <FieldLabel required>What makes you unique beyond your resume?</FieldLabel>
              <DarkTextarea
                {...register('unique_value')}
                placeholder="E.g., I bridge the gap between deep technical work and executive communication — I can architect a system and then explain it to a board."
                error={errors.unique_value?.message}
              />
            </div>

            <div>
              <FieldLabel required>What&apos;s your proudest professional achievement?</FieldLabel>
              <DarkTextarea
                {...register('proudest_achievement')}
                placeholder="E.g., I led a 3-person team to rebuild our checkout flow, cutting abandonment by 40% and adding $2M in annual revenue."
                error={errors.proudest_achievement?.message}
              />
            </div>
          </div>
        </div>
      )

      // Step 8: Optional Extras
      case 8: return (
        <div>
          <StepHeading step={8} title="Optional Extras" subtitle="Certifications, languages, framing notes" />
          <div className="space-y-5">
            <div>
              <FieldLabel>Certifications</FieldLabel>
              <div className="flex gap-2 mb-3">
                <input
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCert() } }}
                  placeholder="AWS Certified, PMP, etc."
                  className="flex-1 h-9 px-3 rounded text-[14px] outline-none transition-all duration-200"
                  style={{ backgroundColor: '#1A1A1F', border: '1px solid #222228', color: '#EDEDEF' }}
                  onFocus={e => { e.target.style.borderColor = '#E5C07B' }}
                  onBlur={e => { e.target.style.borderColor = '#222228' }}
                />
                <button type="button" onClick={addCert} className="w-9 h-9 rounded border flex items-center justify-center" style={{ borderColor: '#222228', color: '#8A8A8E' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {certifications.map((cert) => (
                  <span key={cert} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[13px] border" style={{ backgroundColor: '#1A1A1F', borderColor: '#222228', color: '#8A8A8E' }}>
                    {cert}
                    <button type="button" onClick={() => setValue('certifications', certifications.filter(c => c !== cert))} style={{ color: '#555559' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="h-px" style={{ backgroundColor: '#1A1A1F' }} />

            <div>
              <FieldLabel>Languages</FieldLabel>
              <div className="flex gap-2 mb-3">
                <input
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLang() } }}
                  placeholder="English (native), Arabic (fluent)"
                  className="flex-1 h-9 px-3 rounded text-[14px] outline-none transition-all duration-200"
                  style={{ backgroundColor: '#1A1A1F', border: '1px solid #222228', color: '#EDEDEF' }}
                  onFocus={e => { e.target.style.borderColor = '#E5C07B' }}
                  onBlur={e => { e.target.style.borderColor = '#222228' }}
                />
                <button type="button" onClick={addLang} className="w-9 h-9 rounded border flex items-center justify-center" style={{ borderColor: '#222228', color: '#8A8A8E' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {languages.map((lang) => (
                  <span key={lang} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[13px] border" style={{ backgroundColor: '#1A1A1F', borderColor: '#222228', color: '#8A8A8E' }}>
                    {lang}
                    <button type="button" onClick={() => setValue('languages', languages.filter(l => l !== lang))} style={{ color: '#555559' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="h-px" style={{ backgroundColor: '#1A1A1F' }} />

            <div>
              <FieldLabel>Anything to emphasize?</FieldLabel>
              <DarkTextarea
                {...register('things_to_emphasize')}
                placeholder="E.g., Emphasize my startup experience and comfort with ambiguity"
                style={{ minHeight: '80px' }}
              />
            </div>

            <div>
              <FieldLabel>Anything to downplay?</FieldLabel>
              <DarkTextarea
                {...register('things_to_downplay')}
                placeholder="E.g., Don't focus on my time at Company X — it was a short stint"
                style={{ minHeight: '80px' }}
              />
            </div>
          </div>
        </div>
      )

      // Step 9: Review & Save
      case 9: return (
        <div>
          <StepHeading step={9} title="Review & Save" subtitle="Everything looks good? Save your profile to start generating cover letters." />
          <div className="space-y-3">
            {[
              { label: 'CV', value: cvFileName || (initialProfile?.cv_url ? 'Uploaded' : 'Not uploaded') },
              { label: 'Name', value: watch('full_name') || '—' },
              { label: 'Email', value: watch('email') || '—' },
              { label: 'Title', value: watch('job_title') || '—' },
              { label: 'Skills', value: skills.length ? `${skills.length} added` : 'None' },
              { label: 'Experience', value: expFields.length ? `${expFields.length} position${expFields.length > 1 ? 's' : ''}` : 'None' },
              { label: 'Education', value: eduFields.length ? `${eduFields.length} degree${eduFields.length > 1 ? 's' : ''}` : 'None' },
              { label: 'Projects', value: projectFields.length ? `${projectFields.length} project${projectFields.length > 1 ? 's' : ''}` : 'None' },
              { label: 'Tone', value: watch('preferred_tone') || '—' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between px-4 py-3 rounded-lg border"
                style={{ backgroundColor: '#111113', borderColor: '#1E1E23' }}
              >
                <span className="font-mono text-[11px] tracking-wider uppercase" style={{ color: '#555559' }}>{label}</span>
                <span className="text-[13px]" style={{ color: '#EDEDEF' }}>{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <button
              type="submit"
              disabled={saving || saveSuccess}
              className="w-full h-12 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 transition-all duration-200"
              style={{
                backgroundColor: saveSuccess ? 'rgba(126, 198, 153, 0.15)' : '#E5C07B',
                color: saveSuccess ? '#7EC699' : '#0A0A0B',
                border: saveSuccess ? '1px solid rgba(126, 198, 153, 0.3)' : 'none',
                opacity: (saving || saveSuccess) ? 0.8 : 1,
                cursor: (saving || saveSuccess) ? 'not-allowed' : 'pointer',
                boxShadow: saving || saveSuccess ? 'none' : '0 0 24px rgba(229,192,123,0.2)',
              }}
              onMouseEnter={e => { if (!saving && !saveSuccess) (e.currentTarget.style.backgroundColor = '#F0D08A') }}
              onMouseLeave={e => { if (!saveSuccess) (e.currentTarget.style.backgroundColor = '#E5C07B') }}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
              ) : saveSuccess ? (
                <><CheckCircle2 className="w-4 h-4" />Saved!</>
              ) : (
                <><Save className="w-4 h-4" />Save Profile</>
              )}
            </button>
          </div>
        </div>
      )

      default: return null
    }
  }

  return (
    <>
      <AppNavbar />

      {/* Completion celebration overlay */}
      {saveSuccess && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 100 }}
        >
          <div
            style={{
              animation: 'celebration-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              backgroundColor: '#111113',
              border: '1px solid rgba(126,198,153,0.3)',
              borderRadius: '20px',
              padding: '40px 56px',
              textAlign: 'center',
              boxShadow: '0 0 60px rgba(126,198,153,0.15), 0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: 'rgba(126,198,153,0.12)', border: '2px solid rgba(126,198,153,0.35)' }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: '#7EC699' }} />
            </div>
            <p className="font-serif text-[24px] tracking-[-0.01em] mb-2" style={{ color: '#EDEDEF' }}>
              Profile saved!
            </p>
            <p className="text-[14px]" style={{ color: '#555559' }}>
              Taking you to the dashboard…
            </p>
          </div>
        </div>
      )}

      <div className="min-h-screen" style={{ backgroundColor: '#0A0A0B' }}>
        <div className="max-w-[680px] mx-auto px-6 sm:px-8 py-10">

          {/* Header */}
          <div className="mb-8 animate-fade-up">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase mb-3" style={{ color: '#555559' }}>
              Step {currentStep} of {TOTAL_STEPS} — {STEP_LABELS[currentStep - 1]}
            </p>
            <h1 className="font-serif text-[30px] tracking-[-0.02em] mb-5" style={{ color: '#EDEDEF' }}>
              Your Profile
            </h1>

            {/* Progress bar */}
            <div className="relative h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: '#1A1A1F' }}>
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #E5C07B 0%, rgba(229,192,123,0.7) 100%)',
                  boxShadow: '0 0 8px rgba(229,192,123,0.4)',
                  transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </div>

            {/* Step dots */}
            <div className="flex items-center justify-between mt-3">
              {STEP_LABELS.map((label, i) => {
                const stepNum = i + 1
                const done = stepNum < currentStep
                const active = stepNum === currentStep
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className="w-2 h-2 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: done ? '#E5C07B' : active ? '#E5C07B' : '#2A2A30',
                        transform: active ? 'scale(1.4)' : 'scale(1)',
                        boxShadow: active ? '0 0 6px rgba(229,192,123,0.5)' : 'none',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step content with slide animation */}
          <form onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}>
            <div
              key={currentStep}
              className="rounded-xl border p-7 mb-6"
              style={{
                backgroundColor: '#111113',
                borderColor: '#1E1E23',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                animation: `${direction === 'forward' ? 'slide-in-right' : 'slide-in-left'} 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
              }}
            >
              {saveValidationError && (
                <div
                  className="mb-5 rounded-lg border px-4 py-3 text-[13px]"
                  style={{
                    borderColor: 'rgba(224, 108, 117, 0.32)',
                    backgroundColor: 'rgba(224, 108, 117, 0.1)',
                    color: '#E06C75',
                  }}
                >
                  {saveValidationError}
                </div>
              )}
              {renderStepContent()}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pb-10">
              <button
                type="button"
                onClick={goBack}
                disabled={currentStep === 1}
                className="flex items-center gap-2 h-10 px-5 rounded-lg border text-[13px] font-medium transition-all duration-200"
                style={{
                  borderColor: currentStep === 1 ? '#1A1A1F' : '#2A2A30',
                  color: currentStep === 1 ? '#2A2A30' : '#6A6A70',
                  cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={e => { if (currentStep > 1) { e.currentTarget.style.borderColor = '#3A3A42'; e.currentTarget.style.color = '#EDEDEF' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = currentStep === 1 ? '#1A1A1F' : '#2A2A30'; e.currentTarget.style.color = currentStep === 1 ? '#2A2A30' : '#6A6A70' }}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {currentStep < TOTAL_STEPS && (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-2 h-10 px-6 rounded-lg text-[13px] font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: '#E5C07B',
                    color: '#0A0A0B',
                    boxShadow: '0 0 16px rgba(229,192,123,0.18)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F0D08A'; e.currentTarget.style.boxShadow = '0 0 24px rgba(229,192,123,0.28)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#E5C07B'; e.currentTarget.style.boxShadow = '0 0 16px rgba(229,192,123,0.18)' }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

function StepHeading({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase mb-1.5" style={{ color: '#555559' }}>
        Step {step}
      </p>
      <h2 className="font-serif text-[22px] leading-tight tracking-[-0.01em] mb-1" style={{ color: '#EDEDEF' }}>
        {title}
      </h2>
      {subtitle && <p className="text-[13px]" style={{ color: '#6A6A70' }}>{subtitle}</p>}
    </div>
  )
}
