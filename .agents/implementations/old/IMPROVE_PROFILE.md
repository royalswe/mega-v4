# Implement Robust User-Interaction System (Profile Navigation, Content Aggregation, Private Messaging, and Global Search)

Implement user profile enhancements, messaging capabilities, and platform-wide search for Existenz V4.

## User Review Required

> [!IMPORTANT]
> A new Payload collection `PrivateMessages` will be added to store private message history.
> We will need to run database migrations to create the corresponding database table.

## Open Questions

None. The requirements map directly to existing structures in the project.

## Proposed Changes

---

### Database Schema / Payload Collections

#### [NEW] [private-messages index.ts](file:///Users/royal/www/v4/src/collections/PrivateMessages/index.ts)

- Define the new collection `private-messages` with fields `sender` (relationship to `users`), `receiver` (relationship to `users`), `message` (text/textarea), and `isRead` (boolean).
- Configure access control: users can only read messages where they are the sender or receiver, they can only create messages if they are logged in (sender matches current user), and they can only update `isRead` to true if they are the receiver.

#### [MODIFY] [payload.config.ts](file:///Users/royal/www/v4/src/payload.config.ts)

- Register `PrivateMessages` in the `collections` array.

---

### User Profile Page & Content Aggregation

#### [MODIFY] [UserProfilePage page.tsx](<file:///Users/royal/www/v4/src/app/(frontend)/user/[username]/page.tsx>)

- Dynamically fetch contributions (submitted links, comments, posts) authored by the user whose profile is being viewed.
- Implement tabs on the profile page:
  - **Links**: Displays `LinkCard` components for links submitted by the user.
  - **Posts**: Displays `PostCard` components for posts authored by the user.
  - **Comments**: Displays comment preview cards listing user comments, including a reference to what link or post they commented on.
  - **Messages**: Visible if a user is logged in.
    - If viewing _own_ profile: show an **Inbox** listing all message threads/conversations. Each conversation will display the other user's avatar, username, last message snippet, timestamp, and a green unread badge.
    - If viewing _another_ user's profile: show a **DM Conversation** view between the logged-in user and that user. Display the message exchange, automatically mark incoming messages as read, and provide a form to send new messages with Optimistic UI updates.

---

### Private Messaging Server Actions & API

#### [NEW] [messages.ts](file:///Users/royal/www/v4/src/app/actions/messages.ts)

- Implement `sendPrivateMessage` server action: validates user, checks sender context, creates a private message document, and triggers page/layout revalidation.
- Implement `markMessagesAsRead` server action: updates all unread messages from a specific sender to the current user as read.

#### [NEW] [route.ts](file:///Users/royal/www/v4/src/app/api/messages/unread-count/route.ts)

- An endpoint `/api/messages/unread-count` that counts all unread private messages (`isRead: false` and `receiver: userId`) for the logged-in user.

---

### Navigation & Header Notifications

#### [MODIFY] [UserMenu.client.tsx](file:///Users/royal/www/v4/src/components/layout/UserMenu.client.tsx)

- Add client-side state for the unread private message count.
- Implement polling (every 10-15 seconds) or direct check of `/api/messages/unread-count` to update the badge.
- Render a real-time red notification badge on the user's avatar/icon when unread count > 0.

#### [MODIFY] [Header.tsx](file:///Users/royal/www/v4/src/components/layout/Header.tsx)

- Insert a global **Search Bar** in the header.
- The search bar will use semantic HTML (`<form role="search" ...>`) and support full keyboard navigation.

---

### Global Search Results

#### [NEW] [search page.tsx](<file:///Users/royal/www/v4/src/app/(frontend)/search/page.tsx>)

- Parse search query parameter `q`.
- Query `users` (by username), `posts` (by title/slug), and `links` (by title/description/url) using Payload's `contains` operator.
- Display matching results beautifully in grouped tabs (Users, Posts, Links).

---

### Clickable Username Navigation

#### [MODIFY] [LinkCard.tsx](file:///Users/royal/www/v4/src/components/links/LinkCard.tsx)

- Update "Submitted by [username]" text to link to `/user/[username]`.

#### [MODIFY] [PostCard.tsx](file:///Users/royal/www/v4/src/components/posts/PostCard.tsx)

- Update "Submitted by [username]" text to link to `/user/[username]`.

#### [MODIFY] [post id page.tsx](<file:///Users/royal/www/v4/src/app/(frontend)/post/[id]/page.tsx>)

- Update post author block to link to `/user/[username]`.

#### [MODIFY] [link id page.tsx](<file:///Users/royal/www/v4/src/app/(frontend)/link/[id]/page.tsx>)

- Update link author block to link to `/user/[username]`.

#### [MODIFY] [submitted page.tsx](<file:///Users/royal/www/v4/src/app/(frontend)/submitted/page.tsx>)

- Update "Submitted by [username]" text to link to `/user/[username]`.

---

## Verification Plan

### Automated Tests

- Run `pnpm run typecheck` to verify TypeScript compile checks.
- Run `pnpm run test:int` to check integration tests.

### Manual Verification

- Sign up two users (e.g. `user_a` and `user_b`).
- Check that username links on all pages navigate to `/user/[username]`.
- Verify profile tabs (Links, Posts, Comments) populate correctly.
- Test sending private messages between `user_a` and `user_b` from the profiles. Verify optimistic updates are instant before server response.
- Verify the red notification badge appears on the receiver's avatar when a new message is sent.
- Query various items in the global search bar, ensure results contain correct matching Users, Posts, and Links.
