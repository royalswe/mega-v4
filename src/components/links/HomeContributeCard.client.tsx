'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Link2,
  MessageSquarePlus,
  PlusCircle,
  Sparkles,
  XIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal, ModalClose, ModalContent, ModalTitle } from '@/components/ui/modal'
import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { SubfeedAvatar } from '@/components/subfeeds/SubfeedAvatar'
import {
  setContributeCardCollapsedPreference,
  setHomeSubfeedsViewPreference,
} from '@/app/actions/links'
import type { AppDictionary } from '@/lib/dictionaries'
import type { Media } from '@/payload-types'

interface HomeContributeCardSubfeed {
  id: number
  name: string
}

interface StripItemSubfeed {
  id: number
  name?: string | null
  slug?: string | null
  avatar?: number | Media | null
}

interface HomeContributeStripItem {
  subfeed: StripItemSubfeed
  activityToday: number
}

interface HomeContributeCardProps {
  dict: AppDictionary
  variant: 'member' | 'noSubfeeds' | 'guest'
  joinedSubfeeds?: HomeContributeCardSubfeed[]
  initialCollapsed?: boolean
  stripItems?: HomeContributeStripItem[]
  stripView?: 'trending' | 'joined'
  hasJoinedSubfeeds?: boolean
}

export function HomeContributeCard({
  dict,
  variant,
  joinedSubfeeds = [],
  initialCollapsed = false,
  stripItems = [],
  stripView = 'trending',
  hasJoinedSubfeeds = false,
}: HomeContributeCardProps) {
  const router = useRouter()
  const [linkOpen, setLinkOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [currentView, setCurrentView] = useState<'trending' | 'joined'>(stripView)
  const [, startCollapseTransition] = useTransition()
  const [isViewPending, startViewTransition] = useTransition()

  const copy = dict.pages.contribute
  const stripCopy = dict.pages.subfeedStrip
  const activityLabel = dict.subfeeds.listControls.activityToday

  const iconAccent = variant === 'noSubfeeds' ? 'text-sky-500' : 'text-amber-500'
  const accentClass = variant === 'noSubfeeds' ? 'border-l-sky-400' : 'border-l-amber-400'

  const handleLinkSuccess = () => {
    setLinkOpen(false)
    router.refresh()
  }

  const handlePostSuccess = () => {
    setPostOpen(false)
    router.refresh()
  }

  const handleToggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    startCollapseTransition(async () => {
      try {
        await setContributeCardCollapsedPreference(next)
      } catch (error) {
        console.error('Failed to persist contribute card state:', error)
        setCollapsed(!next)
      }
    })
  }

  const handleSelectView = (nextView: 'trending' | 'joined') => {
    if (nextView === currentView) return
    if (nextView === 'joined' && !hasJoinedSubfeeds) return

    const previous = currentView
    setCurrentView(nextView)

    startViewTransition(async () => {
      try {
        await setHomeSubfeedsViewPreference(nextView)
        router.refresh()
      } catch (error) {
        console.error('Failed to persist home subfeed strip preference:', error)
        setCurrentView(previous)
      }
    })
  }

  const subfeedOptions = joinedSubfeeds.map((subfeed) => ({ id: subfeed.id, name: subfeed.name }))

  const renderHeader = () => {
    if (variant === 'guest') {
      return (
        <>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <Sparkles className={`size-4 ${iconAccent}`} aria-hidden="true" />
            {copy.guestTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.guestSubtitle}</p>
        </>
      )
    }

    if (variant === 'noSubfeeds') {
      return (
        <>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <Compass className={`size-4 ${iconAccent}`} aria-hidden="true" />
            {copy.noSubfeedsTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.noSubfeedsSubtitle}</p>
        </>
      )
    }

    return (
      <>
        <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
          <PlusCircle className={`size-4 ${iconAccent}`} aria-hidden="true" />
          {copy.memberTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.memberSubtitle}</p>
      </>
    )
  }

  const renderActions = () => {
    if (variant === 'guest') {
      return (
        <>
          <Button asChild size="sm">
            <Link href="/create-account">{copy.signUpAction}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/how-it-works">{copy.learnMoreAction}</Link>
          </Button>
        </>
      )
    }

    if (variant === 'noSubfeeds') {
      return (
        <>
          <Button asChild size="sm">
            <Link href="/subfeeds">{copy.browseSubfeedsAction}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/subfeeds/new">{copy.createSubfeedAction}</Link>
          </Button>
        </>
      )
    }

    return (
      <>
        <Button size="sm" onClick={() => setLinkOpen(true)}>
          <Link2 className="mr-1 size-4" aria-hidden="true" />
          {copy.shareLinkAction}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
          <MessageSquarePlus className="mr-1 size-4" aria-hidden="true" />
          {copy.startDiscussionAction}
        </Button>
      </>
    )
  }

  return (
    <section className={`rounded-md border-l-4 ${accentClass} bg-card p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">{renderHeader()}</div>
        <button
          type="button"
          onClick={handleToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? copy.expandLabel : copy.collapseLabel}
          className="shrink-0 inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!collapsed ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">{renderActions()}</div>

          {stripItems.length > 0 ? (
            <div className="mt-4 border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{stripCopy.title}</h3>
                  <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-1 text-xs">
                    <button
                      type="button"
                      disabled={isViewPending}
                      onClick={() => handleSelectView('trending')}
                      className={`rounded px-2 py-1 ${currentView === 'trending' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {stripCopy.trendingTab}
                    </button>
                    <button
                      type="button"
                      disabled={isViewPending || !hasJoinedSubfeeds}
                      onClick={() => handleSelectView('joined')}
                      className={`rounded px-2 py-1 ${currentView === 'joined' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'} ${!hasJoinedSubfeeds ? 'opacity-50' : ''}`}
                    >
                      {stripCopy.joinedTab}
                    </button>
                  </div>
                </div>
                <Link
                  href="/subfeeds"
                  className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {stripCopy.browseAll}
                </Link>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {stripItems.map(({ subfeed, activityToday }) => (
                  <Link
                    key={subfeed.id}
                    href={`/subfeeds/${subfeed.slug}`}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs transition hover:border-foreground/20"
                  >
                    <SubfeedAvatar
                      subfeed={subfeed}
                      className="size-5 rounded-full object-cover"
                      fallbackClassName="inline-flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                    />
                    <span className="max-w-40 truncate">{subfeed.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {activityToday} {activityLabel}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal open={linkOpen} onOpenChange={setLinkOpen}>
        <ModalContent className="max-w-lg border-0 bg-transparent p-0 shadow-none">
          <ModalTitle className="sr-only">{copy.shareLinkModalTitle}</ModalTitle>
          <ModalClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dict.subfeeds.closeModalLabel}
              className="absolute top-1 right-1 z-20"
            >
              <XIcon className="size-6" />
            </Button>
          </ModalClose>
          <LinkSubmitForm
            dict={dict}
            subfeeds={subfeedOptions}
            defaultFeed="subfeed"
            defaultSubfeedId={subfeedOptions[0]?.id}
            onSuccess={handleLinkSuccess}
            onCancel={() => setLinkOpen(false)}
          />
        </ModalContent>
      </Modal>

      <Modal open={postOpen} onOpenChange={setPostOpen}>
        <ModalContent className="max-w-lg border-0 bg-transparent p-0 shadow-none">
          <ModalTitle className="sr-only">{copy.startDiscussionModalTitle}</ModalTitle>
          <ModalClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dict.subfeeds.closeModalLabel}
              className="absolute top-1 right-1 z-20"
            >
              <XIcon className="size-6" />
            </Button>
          </ModalClose>
          <PostSubmitForm
            dict={dict}
            subfeeds={subfeedOptions}
            defaultFeed="subfeed"
            defaultSubfeedId={subfeedOptions[0]?.id}
            onSuccess={handlePostSuccess}
            onCancel={() => setPostOpen(false)}
          />
        </ModalContent>
      </Modal>
    </section>
  )
}
