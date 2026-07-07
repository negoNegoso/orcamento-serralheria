export function canReassignOwner(input: {
  role: 'admin' | 'vendedor'
  userId: string
  quoteOwnerId: string | null
}): boolean {
  return input.role === 'admin' || input.userId === input.quoteOwnerId
}
