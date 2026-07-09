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
