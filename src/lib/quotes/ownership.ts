export function canReassignOwner(input: {
  role: 'admin_system' | 'admin' | 'vendedor'
  userId: string
  quoteOwnerId: string | null
}): boolean {
  return input.role === 'admin' || input.role === 'admin_system' || input.userId === input.quoteOwnerId
}
