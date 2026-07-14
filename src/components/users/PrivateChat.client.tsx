'use client'

import { useEffect, useState, useRef } from 'react'
import { sendPrivateMessage, markMessagesAsRead } from '@/app/actions/messages'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

type User = {
  id: number
  username: string
  reputationPublicLabel?: string | null
}

type PrivateMessage = {
  id: string | number
  sender: number | User
  receiver: number | User
  message: string
  isRead: boolean
  createdAt: string
}

type PrivateChatProps = {
  profileUser: User
  currentUser: User
  initialMessages: PrivateMessage[]
}

export function PrivateChat({ profileUser, currentUser, initialMessages }: PrivateChatProps) {
  const [messages, setMessages] = useState<PrivateMessage[]>(initialMessages)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  // Scroll to bottom on load/new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark incoming messages as read when chat is opened/updated
  useEffect(() => {
    const markRead = async () => {
      const hasUnread = messages.some(
        (m) =>
          (typeof m.sender === 'object' ? m.sender.id : m.sender) === profileUser.id && !m.isRead,
      )
      if (hasUnread) {
        try {
          await markMessagesAsRead(profileUser.id)
        } catch (err) {
          console.error('Failed to mark messages as read:', err)
        }
      }
    }
    markRead()
  }, [messages, profileUser.id])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || sending) return

    const messageText = inputText.trim()
    setInputText('')
    setSending(true)

    // Optimistic message update
    const optimisticMessage: PrivateMessage = {
      id: `temp-${Date.now()}`,
      sender: currentUser.id,
      receiver: profileUser.id,
      message: messageText,
      isRead: false,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const savedMsg = await sendPrivateMessage(profileUser.username, messageText)
      // Update with the actual saved message from database
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMessage.id ? (savedMsg as unknown as PrivateMessage) : m,
        ),
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to send message')
      // Revert optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
      setInputText(messageText) // Restore text
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[450px] border rounded-lg bg-card text-card-foreground">
      {/* Chat header */}
      <div className="p-3 border-b flex items-center justify-between bg-muted/20">
        <div>
          <h3 className="font-semibold text-sm">Conversation with {profileUser.username}</h3>
          <p className="text-xs text-muted-foreground">
            {profileUser.reputationPublicLabel || 'Member'}
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No messages yet. Send a message to start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const senderId = typeof msg.sender === 'object' ? msg.sender.id : msg.sender
            const isMe = senderId === currentUser.id

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[80%] ${
                  isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted text-foreground rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-3 border-t flex gap-2 items-center bg-muted/20">
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message ${profileUser.username}...`}
          className="min-h-10 max-h-20 flex-1 resize-none py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!inputText.trim() || sending}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send Message</span>
        </Button>
      </form>
    </div>
  )
}
