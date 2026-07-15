const TTL_MS = 30_000

let cache: { value: boolean; expiresAt: number } | null = null

// Exposto apenas para testes.
export function __resetMaintenanceCache() {
  cache = null
}

export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=maintenance_mode&limit=1`
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return false // fail-open (não cacheia erro)

    const rows = (await res.json()) as Array<{ maintenance_mode: boolean }>
    const value = rows[0]?.maintenance_mode === true
    cache = { value, expiresAt: now + TTL_MS }
    return value
  } catch {
    return false // fail-open
  }
}
