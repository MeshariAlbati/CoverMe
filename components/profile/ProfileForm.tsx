'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Loader2, Plus, X, CheckCircle2, Save
} from 'lucide-react'
import type { LLMProvider, Profile } from '@/types'
import AppNavbar from '@/components/layout/AppNavbar'
import ProviderPicker from '@/components/ui/provider-picker'

const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
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

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border" style={{ backgroundColor: '#111113', borderColor: '#222228' }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: '#1A1A1F' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: '#EDEDEF' }}>{title}</h2>
        {description && <p className="text-[13px] mt-0.5" style={{ color: '#8A8A8E' }}>{description}</p>}
      </div>
      <div className="p-6">{children}</div>
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
  const [cvProvider, setCvProvider] = useState<LLMProvider>('claude')
  const [cvUploading, setCvUploading] = useState(false)
  const [cvFileName, setCvFileName] = useState<string | null>(null)
  const [rawCvText, setRawCvText] = useState<string>(initialProfile?.raw_cv_text || '')
  const [cvUrl, setCvUrl] = useState<string | null>(initialProfile?.cv_url || null)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showOptional, setShowOptional] = useState(false)
  const [certInput, setCertInput] = useState('')
  const [langInput, setLangInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as Resolver<ProfileFormData>,
    defaultValues: {
      full_name: initialProfile?.full_name || '',
      email: initialProfile?.email || userEmail,
      phone: initialProfile?.phone || '',
      linkedin_url: initialProfile?.linkedin_url || '',
      location: initialProfile?.location || '',
      job_title: initialProfile?.job_title || '',
      years_of_experience: initialProfile?.years_of_experience || 0,
      skills: initialProfile?.skills || [],
      education: initialProfile?.education?.length ? initialProfile.education : [{ degree: '', institution: '', year: '' }],
      work_experience: initialProfile?.work_experience?.length ? initialProfile.work_experience : [{ title: '', company: '', duration: '', highlights: [] }],
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

  async function onSubmit(data: ProfileFormData) {
    setSaving(true)
    const supabase = createClient()

    const profileData = {
      id: userId,
      ...data,
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
      }, 1500)
    }
  }

  return (
    <>
      <AppNavbar />
      <div className="min-h-screen" style={{ backgroundColor: '#0A0A0B' }}>
        <div className="max-w-[760px] mx-auto px-6 sm:px-8 py-10">

          <div className="mb-8 animate-fade-up">
            <h1 className="font-serif text-[32px] tracking-[-0.02em] mb-1" style={{ color: '#EDEDEF' }}>
              Your Profile
            </h1>
            <p className="text-[14px]" style={{ color: '#555559' }}>
              Upload your CV and tell us about yourself. This powers every cover letter.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* CV Upload */}
            <SectionCard title="Upload your CV" description="PDF only — we'll auto-fill everything below">
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
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200"
                style={{
                  borderColor: dragOver ? '#E5C07B' : cvFileName || initialProfile?.cv_url ? 'rgba(126, 198, 153, 0.4)' : '#222228',
                  backgroundColor: dragOver ? 'rgba(229, 192, 123, 0.04)' : cvFileName || initialProfile?.cv_url ? 'rgba(126, 198, 153, 0.04)' : 'transparent',
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
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#E5C07B' }} />
                    <p className="text-[14px] font-medium" style={{ color: '#E5C07B' }}>Analyzing your CV...</p>
                    <p className="text-[12px]" style={{ color: '#555559' }}>Extracting skills, experience, and education</p>
                  </div>
                ) : cvFileName || initialProfile?.cv_url ? (
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle2 className="w-8 h-8" style={{ color: '#7EC699' }} />
                    <p className="text-[14px] font-medium" style={{ color: '#7EC699' }}>{cvFileName || 'CV uploaded'}</p>
                    <p className="text-[12px]" style={{ color: '#555559' }}>Click to upload a different file</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8" style={{ color: '#333338' }} />
                    <p className="text-[14px] font-medium" style={{ color: '#8A8A8E' }}>Drag & drop or click to upload</p>
                    <p className="text-[12px]" style={{ color: '#555559' }}>PDF only, max 10MB</p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Personal Info */}
            <SectionCard title="Personal Information">
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
            </SectionCard>

            {/* Skills */}
            <SectionCard title="Skills" description="Add or edit your skills — drag from CV or type manually">
              <div className="flex gap-2 mb-4">
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                  placeholder="Type a skill and press Enter"
                  className="flex-1 h-9 px-3 rounded text-[14px] outline-none transition-all duration-200"
                  style={{
                    backgroundColor: '#1A1A1F',
                    border: '1px solid #222228',
                    color: '#EDEDEF',
                  }}
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
            </SectionCard>

            {/* Work Experience */}
            <SectionCard title="Work Experience">
              <div className="space-y-4">
                {expFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-4 rounded border relative"
                    style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
                  >
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
            </SectionCard>

            {/* Education */}
            <SectionCard title="Education">
              <div className="space-y-4">
                {eduFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-4 rounded border relative"
                    style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
                  >
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
            </SectionCard>

            {/* Preferences */}
            <SectionCard title="Your Preferences" description="Help us write letters that sound like you">
              <div className="space-y-7">
                {/* Preferred Tone */}
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

                {/* Career Intent */}
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

                {/* Open-ended questions */}
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
            </SectionCard>

            {/* Optional Extras */}
            <div className="rounded-lg border" style={{ backgroundColor: '#111113', borderColor: '#222228' }}>
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="w-full px-6 py-5 flex items-center justify-between transition-colors"
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A1A1F')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div>
                  <p className="text-[15px] font-semibold text-left" style={{ color: '#EDEDEF' }}>Optional Extras</p>
                  <p className="text-[13px] text-left mt-0.5" style={{ color: '#8A8A8E' }}>Certifications, languages, framing notes</p>
                </div>
                <div className="text-[12px] font-medium flex items-center gap-1" style={{ color: '#555559' }}>
                  {showOptional ? 'Hide' : 'Show'}
                  <span className="ml-1">{showOptional ? '↑' : '↓'}</span>
                </div>
              </button>

              {showOptional && (
                <div className="px-6 pb-6 space-y-5 border-t" style={{ borderColor: '#1A1A1F' }}>
                  <div className="pt-5">
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
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end pb-8">
              <button
                type="submit"
                disabled={saving || saveSuccess}
                className="h-10 px-6 rounded text-[14px] font-medium flex items-center gap-2 transition-all duration-200"
                style={{
                  backgroundColor: saveSuccess ? 'rgba(126, 198, 153, 0.15)' : '#E5C07B',
                  color: saveSuccess ? '#7EC699' : '#0A0A0B',
                  border: saveSuccess ? '1px solid rgba(126, 198, 153, 0.3)' : 'none',
                  opacity: (saving || saveSuccess) ? 0.8 : 1,
                  cursor: (saving || saveSuccess) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => {
                  if (!saving && !saveSuccess) (e.currentTarget.style.backgroundColor = '#F0D08A')
                }}
                onMouseLeave={e => {
                  if (!saveSuccess) (e.currentTarget.style.backgroundColor = '#E5C07B')
                }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Profile
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
