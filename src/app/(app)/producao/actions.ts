'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { isValidStage, type Stage } from '@/lib/production/stages'

export async function setProductionStage(quoteId: string, stage: Stage): Promise<void> {
  const { supabase } = await getProfile()
  if (!isValidStage(stage)) throw new Error('Etapa inválida')
  const { error } = await supabase.from('quotes')
    .update({ production_stage: stage, updated_at: new Date().toISOString() })
    .eq('id', quoteId).eq('status', 'aprovado').is('archived_at', null)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/calendario')
}

export async function archiveQuote(quoteId: string): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ archived_at: new Date().toISOString(), production_stage: 'instalado' })
    .eq('id', quoteId)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
  revalidatePath('/producao/concluidos')
  revalidatePath('/producao/calendario')
}

export async function addPendency(quoteId: string, label: string): Promise<void> {
  const { supabase } = await getProfile()
  const t = label.trim()
  if (!t) return
  const { error } = await supabase.from('quote_pendencies').insert({ quote_id: quoteId, label: t })
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}

export async function togglePendency(id: string, done: boolean): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quote_pendencies').update({ done }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}

export async function updatePendency(id: string, label: string): Promise<void> {
  const { supabase } = await getProfile()
  const t = label.trim()
  if (!t) return
  const { error } = await supabase.from('quote_pendencies').update({ label: t }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}

export async function deletePendency(id: string): Promise<void> {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quote_pendencies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/producao')
}
