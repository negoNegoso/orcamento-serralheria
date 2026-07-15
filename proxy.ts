import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isMaintenanceMode } from '@/lib/site-status'
import { maintenanceResponse } from '@/lib/maintenance-response'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function proxy(_request: NextRequest) {
  if (await isMaintenanceMode()) return maintenanceResponse()
  return NextResponse.next()
}

export const config = {
  // Roda em tudo, exceto assets internos hasheados e o favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
