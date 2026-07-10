'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'

export async function saveCompany(formData: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('company_settings').update({
    name: String(formData.get('name') ?? ''),
    cnpj: String(formData.get('cnpj') ?? ''),
    receiver_name: String(formData.get('receiver_name') ?? ''),
    city: String(formData.get('city') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    about_text: String(formData.get('about_text') ?? ''),
    warranty_text: String(formData.get('warranty_text') ?? ''),
    default_validity_days: Number(formData.get('default_validity_days') ?? 15),
    logo_url: String(formData.get('logo_url') ?? '') || null,
  }).eq('id', 1)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/empresa')
}
