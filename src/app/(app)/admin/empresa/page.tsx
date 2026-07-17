import { getCompany } from '@/lib/auth'
import { saveCompany } from './actions'
import { CompanyForm } from './company-form'

export default async function EmpresaPage() {
  const { supabase, company } = await getCompany()
  const { data: areas } = await supabase.from('business_areas').select('name').order('name')
  return (
    <CompanyForm
      settings={company}
      action={saveCompany}
      areas={(areas ?? []).map((a) => a.name as string)}
    />
  )
}
