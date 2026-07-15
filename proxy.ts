import { NextResponse } from 'next/server'
import { isMaintenanceMode } from '@/lib/site-status'
import { maintenanceResponse } from '@/lib/maintenance-response'

export async function proxy() {
  if (await isMaintenanceMode()) return maintenanceResponse()
  return NextResponse.next()
}

export const config = {
  // Roda em tudo, exceto assets internos hasheados e o favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
