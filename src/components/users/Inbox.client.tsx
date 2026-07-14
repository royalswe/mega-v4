'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/users/Avatar'
import { MessageSquare } from 'lucide-react'

type User = {
  id: number
  username: string
  avatar?: any
  reputationPublicLabel?: string | null
}

type PrivateMessage = {
  id: string | number
  message: string
  isRead: boolean
  createdAt: string
}

type Conversation = {
  partner: User
  lastMessage: PrivateMessage
  unreadCount: number
}

type InboxProps = {
  conversations: Conversation[]
}

export function Inbox({ conversations }: InboxProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg bg-card text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm font-medium">Your inbox is empty</p>
        <p className="text-xs">When you receive private messages, they will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {conversations.map((conv) => {
        const partner = conv.partner
        const lastMsg = conv.lastMessage
        const date = new Date(lastMsg.createdAt)
        const timeString = date.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        return (
          <Link
            key={partner.id}
            href={`/user/${partner.username}?tab=messages`}
            className="block group"
          >
            <Card className="hover:bg-muted/40 transition-colors border group-hover:border-primary/20">
              <CardContent className="p-4 flex items-center gap-4">
                <Avatar user={partner as any} className="h-12 w-12 text-lg shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm group-hover:text-primary transition-colors">
                      {partner.username}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeString}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate pr-6">
                    {lastMsg.message}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
