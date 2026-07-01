'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
  ModalClose,
} from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ExternalLink, X, FileText, Globe, Loader2, Play, Image as ImageIcon, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LinkPreviewModalProps {
  url: string
  title: string
  type?: string
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  embedCheck: {
    embeddable: boolean
    title?: string
    description?: string
    image?: string
    readerText?: string
    loading: boolean
  } | null
}

export function getEmbedType(url: string, dbType?: string) {
  // Use the URL API for reliable parsing instead of fragile regexes.
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    // --- YouTube ---
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      // Standard watch URL: youtube.com/watch?v=ID
      const watchId = parsed.searchParams.get('v')
      if (watchId && watchId.length === 11) {
        return {
          type: 'youtube' as const,
          embedUrl: `https://www.youtube.com/embed/${watchId}`,
        }
      }
      // Embed/short URL paths: /embed/ID, /v/ID, /e/ID
      const pathMatch = parsed.pathname.match(/^\/(?:embed|v|e)\/([A-Za-z0-9_-]{11})/)
      if (pathMatch) {
        return {
          type: 'youtube' as const,
          embedUrl: `https://www.youtube.com/embed/${pathMatch[1]}`,
        }
      }
      // Shorts: /shorts/ID
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)
      if (shortsMatch) {
        return {
          type: 'youtube' as const,
          embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}`,
        }
      }
    }

    if (host === 'youtu.be') {
      // youtu.be/ID
      const id = parsed.pathname.slice(1)
      if (id.length >= 11) {
        return {
          type: 'youtube' as const,
          embedUrl: `https://www.youtube.com/embed/${id.slice(0, 11)}`,
        }
      }
    }

    // --- Vimeo ---
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const vimeoMatch = parsed.pathname.match(/\/(?:video\/)?([0-9]+)/)
      if (vimeoMatch) {
        return {
          type: 'vimeo' as const,
          embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        }
      }
    }
  } catch {
    // Malformed URL — fall through to extension checks below
  }

  // --- Direct file extension checks ---

  // Image
  const imgRegex = /\.(jpeg|jpg|gif|png|webp|svg|bmp)(?:\?.*)?$/i
  if (imgRegex.test(url)) {
    return { type: 'image' as const }
  }

  // Video file
  const videoRegex = /\.(mp4|webm|ogg|ogv|mov)(?:\?.*)?$/i
  if (videoRegex.test(url)) {
    return { type: 'video' as const }
  }

  // Audio file
  const audioRegex = /\.(mp3|wav|ogg|aac|flac|m4a)(?:\?.*)?$/i
  if (audioRegex.test(url)) {
    return { type: 'audio' as const }
  }

  return { type: 'iframe' as const }
}

export function LinkPreviewModal({
  url,
  title,
  type: dbType,
  isOpen,
  setIsOpen,
  embedCheck,
}: LinkPreviewModalProps) {
  const embedInfo = getEmbedType(url, dbType)
  const isMedia = ['youtube', 'vimeo', 'image', 'video', 'audio'].includes(embedInfo.type)

  // Determine starting tab
  const [activeTab, setActiveTab] = useState<'preview' | 'reader'>('preview')

  // Extract hostname for display
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    hostname = url
  }

  // Automatically switch tab to reader if we already loaded and embeddable is false
  useEffect(() => {
    if (embedCheck && !embedCheck.loading && !embedCheck.embeddable && !isMedia) {
      setActiveTab('reader')
    } else {
      setActiveTab('preview')
    }
  }, [embedCheck, isMedia])

  return (
    <Modal open={isOpen} onOpenChange={setIsOpen}>
      <ModalContent className={cn(
        "flex flex-col border bg-background shadow-lg overflow-hidden duration-200",
        // Media files get a tighter container matching aspect ratio, webpage gets larger space
        isMedia
          ? "max-w-3xl w-[95vw] max-h-[85vh] rounded-xl"
          : "max-w-5xl w-[95vw] h-[85vh] rounded-xl"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <div className="flex flex-col min-w-0 mr-4">
            <ModalTitle className="text-base font-semibold truncate leading-snug">
              {title}
            </ModalTitle>
            <ModalDescription className="sr-only">
              Preview of {title} from {hostname}
            </ModalDescription>
            <span className="text-xs text-muted-foreground truncate mt-0.5">
              {hostname}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Tab switchers (only for standard webpage iframes, or if not embeddable) */}
            {!isMedia && embedCheck && (
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg text-xs mr-2">
                {embedCheck.embeddable && (
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all",
                      activeTab === 'preview'
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Live Preview</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('reader')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all",
                    activeTab === 'reader' || (!embedCheck.embeddable && activeTab === 'preview')
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Reader View</span>
                </button>
              </div>
            )}
            <ModalClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </ModalClose>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-grow min-h-0 bg-muted/10 overflow-y-auto">
          {/* YouTube Embed */}
          {embedInfo.type === 'youtube' && (
            <div className="w-full h-full aspect-video bg-black flex items-center justify-center">
              <iframe
                src={embedInfo.embedUrl}
                title={title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          )}

          {/* Vimeo Embed */}
          {embedInfo.type === 'vimeo' && (
            <div className="w-full h-full aspect-video bg-black flex items-center justify-center">
              <iframe
                src={embedInfo.embedUrl}
                title={title}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* Direct Video File */}
          {embedInfo.type === 'video' && (
            <div className="w-full h-full aspect-video bg-black flex items-center justify-center">
              <video
                src={url}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Direct Image File */}
          {embedInfo.type === 'image' && (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center p-4 bg-muted/40">
              <img
                src={url}
                alt={title}
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md bg-background"
                loading="lazy"
              />
            </div>
          )}

          {/* Direct Audio File */}
          {embedInfo.type === 'audio' && (
            <div className="w-full p-8 flex flex-col items-center justify-center gap-6 bg-muted/20 min-h-[300px]">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Volume2 className="h-8 w-8 animate-pulse" />
              </div>
              <div className="w-full max-w-md">
                <audio src={url} controls className="w-full" />
              </div>
            </div>
          )}

          {/* Standard Webpage Preview */}
          {embedInfo.type === 'iframe' && (
            <div className="w-full h-full flex flex-col">
              {activeTab === 'preview' && (
                <>
                  {embedCheck?.loading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm">Checking website preview compatibility...</p>
                    </div>
                  )}

                  {!embedCheck?.loading && embedCheck?.embeddable && (
                    <iframe
                      src={url}
                      title={title}
                      className="w-full h-full border-0 bg-white"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  )}

                  {!embedCheck?.loading && embedCheck && !embedCheck.embeddable && (
                    // Iframe is blocked, fallback will show Reader Mode or Info Card
                    <div className="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto h-full gap-4">
                      <div className="h-12 w-12 rounded-full bg-yellow-500/10 text-yellow-600 flex items-center justify-center dark:text-yellow-400">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Direct Preview Blocked</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          This website blocks previews inside other applications due to its security policy (X-Frame-Options/CSP).
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 w-full mt-2">
                        <Button
                          onClick={() => setActiveTab('reader')}
                          variant="outline"
                          className="w-full flex items-center justify-center gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          View Reader Mode Extract
                        </Button>
                        <Button asChild className="w-full">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                            Open website directly
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'reader' && (
                <div className="max-w-2xl mx-auto px-6 py-8">
                  {embedCheck?.loading ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-xs">Extracting reader content...</p>
                    </div>
                  ) : (
                    <article className="prose dark:prose-invert">
                      {embedCheck?.image && (
                        <div className="relative mb-6 rounded-lg overflow-hidden border max-h-[300px]">
                          <img
                            src={embedCheck.image}
                            alt={embedCheck.title || title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <h1 className="text-2xl font-bold font-serif mb-4 leading-tight">
                        {embedCheck?.title || title}
                      </h1>
                      {embedCheck?.description && (
                        <p className="text-muted-foreground italic font-sans border-l-4 pl-4 py-1 mb-6 text-base">
                          {embedCheck.description}
                        </p>
                      )}
                      <hr className="my-6 border-muted" />
                      {embedCheck?.readerText ? (
                        <div className="font-serif leading-relaxed text-foreground/90 space-y-4 text-base md:text-lg whitespace-pre-wrap">
                          {embedCheck.readerText}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No text paragraphs could be extracted from this website. Click below to read the original article.
                        </div>
                      )}
                    </article>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/40 shrink-0 text-xs text-muted-foreground">
          <span className="truncate max-w-[60%] select-all" title={url}>
            {url}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-muted text-primary font-medium transition-colors"
          >
            <span>Open in new tab</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </ModalContent>
    </Modal>
  )
}
