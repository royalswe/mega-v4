'use client'

import { useState, useRef, useEffect } from 'react'
import { trackClick } from '@/app/actions/trackClick'
import { LinkPreviewModal, getEmbedType } from '@/components/links/LinkPreviewModal'

interface TrackedLinkProps {
  url: string
  title: string
  linkId: number
  type?: string
  className?: string
}

export function TrackedLink({ url, title, linkId, type, className }: TrackedLinkProps) {
  const [shouldLoad, setShouldLoad] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  // resolvedUrl may differ from url when we find an embeddable video inside a page (e.g. YouTube in Reddit)
  const [resolvedUrl, setResolvedUrl] = useState(url)
  const [embedCheck, setEmbedCheck] = useState<{
    embeddable: boolean
    title?: string
    description?: string
    image?: string
    readerText?: string
    loading: boolean
  } | null>(null)

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const preloadResetTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  /**
   * Cache for scrape-media results.
   * - `undefined` → not yet attempted
   * - `null`      → attempted, nothing found
   * - `string`    → found this embeddable URL
   */
  const scrapedMediaRef = useRef<string | null | undefined>(undefined)

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
      if (preloadResetTimeoutRef.current) {
        clearTimeout(preloadResetTimeoutRef.current)
      }
    }
  }, [])

  const embedInfo = getEmbedType(url)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const checkEmbeddability = async () => {
    if (embedCheck) return
    setEmbedCheck({ embeddable: true, loading: true })
    try {
      const res = await fetch(`/api/check-embed?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      setEmbedCheck({
        embeddable: data.embeddable,
        title: data.title,
        description: data.description,
        image: data.image,
        readerText: data.readerText,
        loading: false,
      })
    } catch {
      setEmbedCheck({ embeddable: false, loading: false })
    }
  }

  /**
   * Scrape the target page for an embeddable media URL.
   * Result is cached in `scrapedMediaRef` so repeated calls are free.
   */
  const scrapedMediaPromiseRef = useRef<Promise<string | null> | null>(null)

  const scrapeMediaUrl = async (): Promise<string | null> => {
    if (scrapedMediaRef.current !== undefined) return scrapedMediaRef.current
    if (scrapedMediaPromiseRef.current) return scrapedMediaPromiseRef.current
    const promise = (async () => {
      try {
        const mediaType = type === 'image' ? 'image' : 'video'
        const res = await fetch(
          `/api/scrape-media?url=${encodeURIComponent(url)}&type=${mediaType}`,
        )
        const data = await res.json()
        const found =
          data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0
            ? (data.suggestions[0] as string)
            : null
        scrapedMediaRef.current = found
        return found
      } catch {
        scrapedMediaRef.current = null
        return null
      }
    })()
    scrapedMediaPromiseRef.current = promise
    return promise
  }

  const handlePreload = () => {
    setShouldLoad(true)

    if (preloadResetTimeoutRef.current) {
      clearTimeout(preloadResetTimeoutRef.current)
    }
    preloadResetTimeoutRef.current = setTimeout(() => {
      setShouldLoad(false)
    }, 3000)

    if (embedInfo.type === 'iframe') {
      checkEmbeddability()
      // For video/image links that aren't directly embeddable, warm the scrape
      // cache on hover so the click feels instant.
      if (type === 'video' || type === 'image') {
        scrapeMediaUrl()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(handlePreload, 150)
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (!isOpen) {
      setShouldLoad(false)
    }
  }

  const handleClick = async (e: React.MouseEvent) => {
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
    const isPrimaryButton = e.button === 0

    if (!isPrimaryButton || isModifiedClick) {
      void trackClick(linkId).catch(() => {})
      return
    }

    e.preventDefault()
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = null

    // Track click (fire-and-forget)
    void trackClick(linkId).catch(() => {})

    const mediaTypes = ['video', 'image', 'audio']
    const isUnresolvableMedia = type && mediaTypes.includes(type) && embedInfo.type === 'iframe'

    if (isUnresolvableMedia) {
      if (type === 'video' || type === 'image') {
        // Try to find an embeddable URL within the page (e.g. YouTube link in Reddit)
        const scraped = await scrapeMediaUrl()
        if (scraped) {
          // Found an embeddable URL — show it in the modal
          setResolvedUrl(scraped)
          setShouldLoad(true)
          setIsOpen(true)
          return
        }
      }
      // No embeddable media found → open the original URL in a new tab
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    // Standard modal flow
    handlePreload()
    setIsOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {title}
      </a>

      {/* Speculative preloading — hidden, fires in background on hover */}
      {shouldLoad && !isOpen && (
        <>
          {embedInfo.type === 'iframe' && (
            <iframe
              src={url}
              className="sr-only"
              style={{
                display: 'none',
                width: 0,
                height: 0,
                border: 0,
                position: 'absolute',
                pointerEvents: 'none',
              }}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-forms allow-popups"
            />
          )}
          {embedInfo.type === 'video' && (
            <video src={url} preload="auto" className="sr-only" style={{ display: 'none' }} />
          )}
          {embedInfo.type === 'audio' && (
            <audio src={url} preload="auto" className="sr-only" style={{ display: 'none' }} />
          )}
        </>
      )}

      {/* The actual preview modal */}
      {isOpen && (
        <LinkPreviewModal
          url={resolvedUrl}
          title={title}
          type={type}
          isOpen={isOpen}
          setIsOpen={(open) => {
            setIsOpen(open)
            if (!open) {
              setShouldLoad(false)
            }
          }}
          embedCheck={embedCheck}
        />
      )}
    </>
  )
}
