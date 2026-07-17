import { describe, expect, it } from 'vitest'
import { normalizeCompanyRole, validateAssignInput } from './assign'

describe('normalizeCompanyRole', () => {
  it('mantém admin', () => expect(normalizeCompanyRole('admin')).toBe('admin'))
  it('qualquer outro valor vira vendedor', () => {
    expect(normalizeCompanyRole('vendedor')).toBe('vendedor')
    expect(normalizeCompanyRole('admin_system')).toBe('vendedor')
    expect(normalizeCompanyRole('')).toBe('vendedor')
  })
})

describe('validateAssignInput', () => {
  it('ok quando id e companyId presentes', () => {
    expect(validateAssignInput({ id: 'u1', companyId: 'c1' })).toEqual({ ok: true })
  })
  it('erro sem id', () => {
    expect(validateAssignInput({ id: '', companyId: 'c1' })).toEqual({ ok: false, error: 'Usuário inválido' })
  })
  it('erro sem empresa', () => {
    expect(validateAssignInput({ id: 'u1', companyId: '' })).toEqual({ ok: false, error: 'Selecione uma empresa' })
  })
})
