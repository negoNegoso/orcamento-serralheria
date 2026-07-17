// src/app/(app)/clientes/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { normalizePhone } from '@/lib/clients/summary'

export interface ClientHit {
  id: string
  name: string
  phone: string
}

export async function searchClients(term: string): Promise<ClientHit[]> {
  const { supabase } = await getProfile()
  // vírgula/parênteses quebram a sintaxe do .or() do PostgREST
  const safe = term.trim().replace(/[,()]/g, ' ')
  if (safe.length < 2) return []
  const digits = normalizePhone(safe)
  const filters = [`name.ilike.%${safe}%`]
  if (digits.length >= 4) filters.push(`phone.ilike.%${digits}%`)
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone')
    .or(filters.join(','))
    .order('name')
    .limit(8)
  if (error) return []
  return (data ?? []) as ClientHit[]
}

export async function updateClient(
  input: { id: string; name: string; phone: string }
): Promise<{ ok: true } | { error: string }> {
  const { supabase } = await getProfile()
  const name = input.name.trim()
  if (!name) return { error: 'Informe o nome do cliente' }
  const { error } = await supabase
    .from('clients')
    .update({ name, phone: input.phone.trim() })
    .eq('id', input.id)
  if (error) return { error: 'Erro ao salvar: ' + error.message }
  // trigger clients_sync_quotes atualiza os orçamentos; revalida as telas que os mostram
  revalidatePath('/')
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${input.id}`)
  return { ok: true }
}
