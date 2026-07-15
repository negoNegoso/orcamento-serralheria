import { describe, expect, it } from 'vitest'
import { maintenanceResponse } from './maintenance-response'

describe('maintenanceResponse', () => {
  it('retorna 503 com HTML de manutenção', async () => {
    const res = maintenanceResponse()
    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('retry-after')).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('manutenção')
  })
})
