import dns from 'node:dns/promises'
import net from 'node:net'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const BLOCKED_HOSTNAMES = new Set(['localhost'])

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b] = parts

  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 0) return true

  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()

  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (net.isIP(mapped) === 4) {
      return isPrivateIPv4(mapped)
    }
  }

  return false
}

function isPrivateIpAddress(ip: string): boolean {
  const ipVersion = net.isIP(ip)
  if (ipVersion === 4) return isPrivateIPv4(ip)
  if (ipVersion === 6) return isPrivateIPv6(ip)
  return true
}

function assertProtocolAndHostname(url: URL) {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error('Only http and https URLs are allowed')
  }

  const hostname = url.hostname.toLowerCase()
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('Blocked destination hostname')
  }
}

export async function assertSafeUrl(url: URL) {
  assertProtocolAndHostname(url)

  // Direct IP host
  if (net.isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) {
      throw new Error('Blocked private or loopback destination')
    }
    return
  }

  // DNS resolve hostnames and reject if any resolved address is private/internal.
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length) {
    throw new Error('Destination did not resolve')
  }

  if (addresses.some((address) => isPrivateIpAddress(address.address))) {
    throw new Error('Blocked private or loopback destination')
  }
}

export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = new URL(rawUrl)

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeUrl(currentUrl)

    const response = await fetch(currentUrl.toString(), {
      ...init,
      redirect: 'manual',
    })

    const isRedirect = response.status >= 300 && response.status < 400
    if (!isRedirect) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      throw new Error('Redirect response missing location header')
    }

    currentUrl = new URL(location, currentUrl)
  }

  throw new Error('Too many redirects')
}
