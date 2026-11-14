/**
 * Feed paging shared by the Home and Wall feeds.
 *
 * The feed renders `FEED_PAGE_SIZE` items initially and lazy-loads the next
 * page when the reader scrolls near the end (Reddit/Facebook style). Loading a
 * page re-renders the whole route with `?page=N`, so the server renders pages
 * 1..N cumulatively and `ReorderAwareList` appends only the new cards. The cap
 * keeps the cumulative render bounded at the previous single-page limit.
 */

export const FEED_PAGE_SIZE = 25

export const FEED_MAX_ITEMS = 100

export const FEED_MAX_PAGES = Math.ceil(FEED_MAX_ITEMS / FEED_PAGE_SIZE)

/** Parses the `?page` search param, clamped to the valid 1..FEED_MAX_PAGES range. */
export const parseFeedPage = (raw: string | undefined): number => {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, FEED_MAX_PAGES)
}
