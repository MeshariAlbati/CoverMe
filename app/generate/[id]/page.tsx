import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GenerationView from '@/components/dashboard/GenerationView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GeneratePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: coverLetter } = await supabase
    .from('cover_letters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!coverLetter) redirect('/dashboard')

  return <GenerationView coverLetter={coverLetter} userFullName={profile?.full_name || ''} />
}
