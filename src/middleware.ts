import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * ONLY FOR DEMO-LOGIN PURPOSES
 * Middleware to handle agent token authentication.
 * If an agent token is present in the request, it adds an authorization header with the token.
 * Otherwise, it allows the request to proceed without modification.
 *
 * @param {NextRequest} request - The incoming request object.
 * @returns {NextResponse} - The response object, either modified or unmodified.
 */

export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('agentToken')

  if (!token) {
    return NextResponse.next()
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('authorization', `JWT ${token}`)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
