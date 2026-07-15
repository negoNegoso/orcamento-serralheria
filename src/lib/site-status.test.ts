import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetMaintenanceCache, isMaintenanceMode } from './site-status'

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  __resetMaintenanceCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isMaintenanceMode', () => {
  it('retorna true quando a flag está ativa', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify([{ maintenance_mode: true }]), { status: 200 }))
    expect(await isMaintenanceMode()).toBe(true)
  })

  it('retorna false quando a flag está inativa', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify([{ maintenance_mode: false }]), { status: 200 }))
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('fail-open: retorna false quando o fetch rejeita', async () => {
    mockFetch(async () => { throw new Error('network') })
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('fail-open: retorna false em status != 2xx', async () => {
    mockFetch(async () => new Response('err', { status: 500 }))
    expect(await isMaintenanceMode()).toBe(false)
  })

  it('usa cache dentro do TTL (não refaz fetch)', async () => {
    const fn = vi.fn(async () =>
      new Response(JSON.stringify([{ maintenance_mode: true }]), { status: 200 }))
    vi.stubGlobal('fetch', fn)
    await isMaintenanceMode()
    await isMaintenanceMode()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
