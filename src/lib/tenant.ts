export interface Company {
  id: string
  name: string
  status: 'ativa' | 'suspensa'
  logo_url: string | null
  city: string
  phone: string
  about_text: string
  warranty_text: string
  default_validity_days: number
  cnpj: string
  receiver_name: string
  signature_url: string | null
  accent_color: string
  business_area: string
}

interface TenantProfile {
  role: 'admin_system' | 'admin' | 'vendedor'
  company_id: string | null
  acting_company_id: string | null
}

export function effectiveCompanyId(p: TenantProfile): string | null {
  return p.role === 'admin_system' ? p.acting_company_id : p.company_id
}

export function resolveAccess(p: TenantProfile, company: Company | null): 'ok' | 'sistema' | 'suspensa' {
  if (p.role === 'admin_system') return effectiveCompanyId(p) ? 'ok' : 'sistema'
  if (!company || company.status === 'suspensa') return 'suspensa'
  return 'ok'
}
