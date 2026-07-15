import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isMaintenanceMode } from '@/lib/site-status'
import { maintenanceResponse } from '@/lib/maintenance-response'

const PUBLIC_ASSET = /\.(?:png|jpg|jpeg|svg|ico|webp)$/

export async function proxy(request: NextRequest) {
  // Kill switch: quando em manutenção, bloqueia todas as rotas (inclusive /o/ e assets).
  if (await isMaintenanceMode()) return maintenanceResponse()

  // Rotas públicas (compartilhamento de orçamento e assets) não passam pela auth.
  const path = request.nextUrl.pathname
  if (path.startsWith('/o/') || PUBLIC_ASSET.test(path)) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && path !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // Roda em tudo (inclusive /o/ e imagens, para o kill switch), exceto assets internos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
