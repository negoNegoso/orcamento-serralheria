export interface NavItem {
  label: string
  href: string
  icon: string
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard', adminOnly: true },
  { label: 'Orçamentos', href: '/', icon: 'description' },
  { label: 'Produção', href: '/producao', icon: 'precision_manufacturing' },
  { label: 'Clientes', href: '/clientes', icon: 'contacts' },
  { label: 'Produtos', href: '/admin/produtos', icon: 'inventory_2', adminOnly: true },
  { label: 'Pagamento', href: '/admin/pagamento', icon: 'payments', adminOnly: true },
  { label: 'Empresa', href: '/admin/empresa', icon: 'apartment', adminOnly: true },
  { label: 'Usuários', href: '/admin/usuarios', icon: 'group', adminOnly: true },
]

export function navFor(role: 'admin_system' | 'admin' | 'vendedor'): NavItem[] {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || role !== 'vendedor')
  if (role === 'admin_system') {
    return [...items, { label: 'Sistema', href: '/sistema/empresas', icon: 'admin_panel_settings' }]
  }
  return items
}
