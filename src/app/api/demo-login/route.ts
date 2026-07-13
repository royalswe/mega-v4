import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

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

function appendAgentToken(nextPath: string, token: string): string {
  const url = new URL(nextPath, 'https://local.invalid')
  url.searchParams.set('agentToken', token)

  const query = url.searchParams.toString()
  return query ? `${url.pathname}?${query}` : url.pathname
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
  const mode = searchParams.get('mode')

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

  const payload = await getPayload({ config: configPromise })

  let loginResult: Awaited<ReturnType<typeof payload.login>>
  try {
    if (identity.email) {
      loginResult = await payload.login({
        collection: 'users',
        data: { email: identity.email, password: identity.password },
      })
    } else if (identity.username) {
      loginResult = await payload.login({
        collection: 'users',
        data: { username: identity.username, password: identity.password },
      })
    } else {
      return NextResponse.json({ error: 'Demo login is not configured' }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: 'Demo login credentials are invalid' }, { status: 401 })
  }

  if (!loginResult.token) {
    return NextResponse.json({ error: 'Login token was not returned' }, { status: 500 })
  }

  const location = mode === 'agent' ? appendAgentToken(nextPath, loginResult.token) : nextPath

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
    },
  })

  if (mode === 'agent') {
    return response
  }

  response.cookies.set('payload-token', loginResult.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  })

  return response
}
