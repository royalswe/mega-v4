import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function buildSignature(secret: string, expires: number, nextPath: string): string {
  return createHmac('sha256', secret).update(`${expires}:${nextPath}`).digest('hex')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

function sanitizeNextPath(nextParam: string | null): string {
  if (!nextParam || !nextParam.startsWith('/')) {
    return '/'
  }

  if (nextParam.startsWith('//')) {
    return '/'
  }

  return nextParam
}

function getSetCookieHeaders(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] }

  if (typeof extendedHeaders.getSetCookie === 'function') {
    return extendedHeaders.getSetCookie().filter(Boolean)
  }

  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function getDemoLoginIdentity() {
  const email = process.env.DEMO_LOGIN_EMAIL?.trim()
  const username = process.env.DEMO_LOGIN_USERNAME?.trim()
  const password = process.env.DEMO_LOGIN_PASSWORD

  if (!password || (!email && !username)) {
    return null
  }

  return {
    email,
    username,
    password,
  }
}

export async function GET(request: Request) {
  if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const secret = process.env.DEMO_LOGIN_SECRET
  const identity = getDemoLoginIdentity()

  if (!secret || !identity) {
    return NextResponse.json({ error: 'Demo login is not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const nextPath = sanitizeNextPath(searchParams.get('next'))
  const expiresRaw = searchParams.get('expires')
  const signature = searchParams.get('sig')

  if (!expiresRaw || !signature) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  const expires = Number.parseInt(expiresRaw, 10)

  if (!Number.isFinite(expires)) {
    return NextResponse.json({ error: 'Invalid expires parameter' }, { status: 400 })
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (expires <= nowSeconds) {
    return NextResponse.json({ error: 'Demo link has expired' }, { status: 401 })
  }

  const expectedSignature = buildSignature(secret, expires, nextPath)
  if (!timingSafeEqualHex(expectedSignature, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const loginUrl = new URL('/api/users/login', request.url)
  const loginPayload = identity.email
    ? { email: identity.email, password: identity.password }
    : { username: identity.username, password: identity.password }

  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(loginPayload),
    cache: 'no-store',
  })

  if (!loginResponse.ok) {
    return NextResponse.json({ error: 'Demo login credentials are invalid' }, { status: 401 })
  }

  const setCookies = getSetCookieHeaders(loginResponse.headers)
  if (setCookies.length === 0) {
    return NextResponse.json({ error: 'Auth cookie was not returned by login endpoint' }, { status: 500 })
  }

  const redirectUrl = new URL(nextPath, request.url)
  const response = NextResponse.redirect(redirectUrl, { status: 303 })

  for (const setCookie of setCookies) {
    response.headers.append('Set-Cookie', setCookie)
  }

  return response
}
