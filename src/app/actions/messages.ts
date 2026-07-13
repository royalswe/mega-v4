'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'
import { resolveID } from '@/lib/community/userSignals'

export async function sendPrivateMessage(receiverUsername: string, messageText: string) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to send a message')
  }

  if (!messageText || messageText.trim() === '') {
    throw new Error('Message text cannot be empty')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  // Find the receiver user
  const { docs: receivers } = await payload.find({
    collection: 'users',
    where: {
      username: {
        equals: receiverUsername,
      },
    },
    ...withAccess,
  })

  if (receivers.length === 0) {
    throw new Error('Receiver not found')
  }

  const receiver = receivers[0]

  if (receiver.id === user.id) {
    throw new Error('You cannot send a message to yourself')
  }

  const newMessage = await payload.create({
    collection: 'private-messages',
    data: {
      sender: user.id,
      receiver: receiver.id,
      message: messageText,
      isRead: false,
    },
    ...withAccess,
  })

  revalidatePath(`/user/${receiver.username}`)
  revalidatePath(`/user/${user.username}`)

  return newMessage
}

export async function markMessagesAsRead(senderId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to mark messages as read')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  // Find unread messages from this sender
  const { docs: unreadMessages } = await payload.find({
    collection: 'private-messages',
    where: {
      and: [
        { receiver: { equals: user.id } },
        { sender: { equals: senderId } },
        { isRead: { equals: false } },
      ],
    },
    limit: 100,
    ...withAccess,
  })

  for (const msg of unreadMessages) {
    await payload.update({
      collection: 'private-messages',
      id: msg.id,
      data: {
        isRead: true,
      },
      ...withAccess,
    })
  }

  revalidatePath(`/user/${user.username}`)
}
