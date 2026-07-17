export function normalizeCompanyRole(input: string): 'admin' | 'vendedor' {
  return input === 'admin' ? 'admin' : 'vendedor'
}

export function validateAssignInput(x: { id: string; companyId: string }):
  { ok: true } | { ok: false; error: string } {
  if (!x.id) return { ok: false, error: 'Usuário inválido' }
  if (!x.companyId) return { ok: false, error: 'Selecione uma empresa' }
  return { ok: true }
}
