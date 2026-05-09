import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'spoonful_session'

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const segments = pathname.split('/').filter(Boolean)

  // Let root and static assets through
  if (segments.length === 0) return NextResponse.next()

  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie?.value) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    const session = JSON.parse(cookie.value) as { shopCode?: string; token?: string }
    if (!session.token || !session.shopCode) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    const urlShopCode = segments[0].toLowerCase()
    const sessionShopCode = session.shopCode.toLowerCase()
    if (urlShopCode !== sessionShopCode) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.html$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$).*)'],
}
