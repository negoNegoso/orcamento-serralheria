import { describe, expect, it } from 'vitest'
import { effectiveCompanyId, resolveAccess, type Company } from './tenant'

const company = (status: Company['status']): Company => ({
  id: 'c1', name: 'ACME', status, logo_url: null, city: '', phone: '',
  about_text: '', warranty_text: '', default_validity_days: 15,
  cnpj: '', receiver_name: '', signature_url: null, accent_color: '#006688',
  business_area: 'Serralheria',
})

describe('effectiveCompanyId', () => {
  it('membro comum usa a própria empresa', () => {
    expect(effectiveCompanyId({ role: 'vendedor', company_id: 'c1', acting_company_id: null })).toBe('c1')
    expect(effectiveCompanyId({ role: 'admin', company_id: 'c1', acting_company_id: null })).toBe('c1')
  })
  it('admin_system usa a empresa em atuação', () => {
    expect(effectiveCompanyId({ role: 'admin_system', company_id: null, acting_company_id: 'c2' })).toBe('c2')
  })
  it('admin_system sem seleção não tem empresa', () => {
    expect(effectiveCompanyId({ role: 'admin_system', company_id: null, acting_company_id: null })).toBeNull()
  })
})

describe('resolveAccess', () => {
  it('membro de empresa ativa acessa o app', () => {
    expect(resolveAccess({ role: 'admin', company_id: 'c1', acting_company_id: null }, company('ativa'))).toBe('ok')
  })
  it('membro de empresa suspensa é bloqueado', () => {
    expect(resolveAccess({ role: 'vendedor', company_id: 'c1', acting_company_id: null }, company('suspensa'))).toBe('suspensa')
  })
  it('admin_system sem empresa vai para /sistema', () => {
    expect(resolveAccess({ role: 'admin_system', company_id: null, acting_company_id: null }, null)).toBe('sistema')
  })
  it('admin_system atuando acessa o app mesmo com empresa suspensa', () => {
    expect(resolveAccess({ role: 'admin_system', company_id: null, acting_company_id: 'c1' }, company('suspensa'))).toBe('ok')
  })
})
