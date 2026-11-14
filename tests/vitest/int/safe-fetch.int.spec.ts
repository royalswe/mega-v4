import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertSafeUrl, fetchWithSafeRedirects } from '@/app/api/_utils/safe-fetch'

/**
 * The SSRF guard in front of `/api/check-embed`, `/api/scrape-media`, and the
 * link-metadata scraper. It decides whether the server may make an outbound
 * request on behalf of a user-supplied URL, so its truth table belongs in a
 * fast test rather than in a browser journey.
 */

/** A public address that needs no DNS lookup. */
const PUBLIC_IP = 'http://93.184.216.34/article'

const BLOCKED = [
  ['loopback IPv4', 'http://127.0.0.1/'],
  ['loopback alias', 'http://127.9.9.9/'],
  ['private 10/8', 'http://10.1.2.3/'],
  ['private 172.16/12', 'http://172.16.0.1/'],
  ['private 172.31/12', 'http://172.31.255.255/'],
  ['private 192.168/16', 'http://192.168.0.1/'],
  ['link-local metadata service', 'http://169.254.169.254/latest/meta-data/'],
  ['carrier-grade NAT 100.64/10', 'http://100.64.0.1/'],
  ['benchmark 198.18/15', 'http://198.18.0.1/'],
  ['wildcard 0.0.0.0', 'http://0.0.0.0/'],
  ['loopback IPv6', 'http://[::1]/'],
  ['unspecified IPv6', 'http://[::]/'],
  ['link-local IPv6', 'http://[fe80::1]/'],
  ['unique-local IPv6', 'http://[fd00::1]/'],
  ['IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
  ['localhost', 'http://localhost:3000/'],
  ['mDNS .local', 'http://printer.local/'],
  ['file protocol', 'file:///etc/passwd'],
  ['ftp protocol', 'ftp://example.com/'],
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assertSafeUrl', () => {
  it.each(BLOCKED)('rejects %s', async (_label, url) => {
    await expect(assertSafeUrl(new URL(url))).rejects.toThrow()
  })

  it.each(['http://93.184.216.34/', 'https://93.184.216.34/path?q=1'])(
    'allows public address %s',
    async (url) => {
      await expect(assertSafeUrl(new URL(url))).resolves.toBeUndefined()
    },
  )
})

describe('fetchWithSafeRedirects', () => {
  const response = (status: number, headers: Record<string, string> = {}) =>
    new Response(null, { status, headers })

  it('follows a relative redirect and re-validates the new destination', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(302, { location: '/next' }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchWithSafeRedirects(PUBLIC_IP, {})

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://93.184.216.34/next',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('refuses to follow a redirect into the private network', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(302, { location: 'http://127.0.0.1/' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithSafeRedirects(PUBLIC_IP, {})).rejects.toThrow(
      /private or loopback|Blocked/i,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect without a location header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(302)))

    await expect(fetchWithSafeRedirects(PUBLIC_IP, {})).rejects.toThrow(/missing location/i)
  })

  it('stops after the redirect budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(302, { location: '/again' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithSafeRedirects(PUBLIC_IP, {}, 3)).rejects.toThrow(/too many redirects/i)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
