import { getCompany } from '@/lib/auth'
import { saveCompany } from './actions'
import { CompanyForm } from './company-form'

export default async function EmpresaPage() {
  const { company } = await getCompany()
  return <CompanyForm settings={company} action={saveCompany} />
}
