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
  { label: 'Produtos', href: '/admin/produtos', icon: 'inventory_2', adminOnly: true },
  { label: 'Pagamento', href: '/admin/pagamento', icon: 'payments', adminOnly: true },
  { label: 'Empresa', href: '/admin/empresa', icon: 'apartment', adminOnly: true },
  { label: 'Usuários', href: '/admin/usuarios', icon: 'group', adminOnly: true },
]

export function navFor(role: 'admin' | 'vendedor'): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.adminOnly || role === 'admin')
}
