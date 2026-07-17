'use server'
import { revalidatePath } from 'next/cache'
import { getCompany } from '@/lib/auth'
import { isValidHexColor } from '@/lib/color'

export async function saveCompany(formData: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const accent = String(formData.get('accent_color') ?? '').toLowerCase()
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')
  const { error } = await supabase.from('companies').update({
    name: String(formData.get('name') ?? ''),
    cnpj: String(formData.get('cnpj') ?? ''),
    receiver_name: String(formData.get('receiver_name') ?? ''),
    city: String(formData.get('city') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    about_text: String(formData.get('about_text') ?? ''),
    warranty_text: String(formData.get('warranty_text') ?? ''),
    default_validity_days: Number(formData.get('default_validity_days') ?? 15),
    logo_url: String(formData.get('logo_url') ?? '') || null,
    signature_url: String(formData.get('signature_url') ?? '') || null,
    accent_color: accent,
    business_area: String(formData.get('business_area') ?? '').trim() || 'Serralheria',
  }).eq('id', company.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/empresa')
  revalidatePath('/', 'layout')
}
