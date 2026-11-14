import { test, expect, type Page } from '@playwright/test'

/**
 * Layout integrity.
 *
 * This is the one thing Vitest cannot check: jsdom has no layout engine, so
 * "does this fit" only exists in a real browser. Everything else about the
 * frontend should be asserted in Vitest against a module interface.
 *
 * The assertion deliberately walks elements instead of reading
 * `documentElement.scrollWidth`, because the root layout sets
 * `overflow-x-hidden` — the page will happily clip an overflowing row and
 * report zero scroll width.
 */

const PUBLIC_ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/subfeeds', name: 'SubFeeds index' },
  { path: '/how-it-works', name: 'How it works' },
  { path: '/wall', name: 'Community Wall' },
  { path: '/search?q=link', name: 'Search results' },
]

/** Elements that spill past the viewport and are not inside a scroller. */
async function findOverflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const describe = (el: Element) => {
      const className =
        typeof el.className === 'string' && el.className.trim().length > 0
          ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
          : ''
      const text = (el.textContent ?? '').trim().slice(0, 40)
      return `${el.tagName.toLowerCase()}${className}${text ? ` — "${text}"` : ''}`
    }

    const isInsideScroller = (el: Element) => {
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true
      }
      return false
    }

    return Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        if (!(el instanceof HTMLElement)) return false
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        if (rect.right <= viewport + 1 && rect.left >= -1) return false
        return !isInsideScroller(el)
      })
      .slice(0, 8)
      .map(describe)
  })
}

test.describe('Layout integrity', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} fits the viewport horizontally`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: 'load' })
      await expect(page.locator('main')).toBeVisible()

      // Let web fonts and client components settle before measuring.
      await page.evaluate(() => document.fonts.ready.then(() => undefined))

      const offenders = await findOverflowingElements(page)
      expect(offenders, `Elements overflow the viewport on ${route.path}`).toEqual([])
    })
  }

  test('mobile menu opens without overflowing', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The menu affordance is only rendered below the lg breakpoint')

    await page.goto('/', { waitUntil: 'load' })
    await page.locator('header summary').first().click()

    const offenders = await findOverflowingElements(page)
    expect(offenders, 'Elements overflow while the mobile menu is open').toEqual([])
  })
})
