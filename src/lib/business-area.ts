export function normalizeAreaName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
