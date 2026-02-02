import type { FieldAccess } from 'payload'

import { checkRole } from './checkRole'

export const checkUserOrAdmin: FieldAccess = ({ req: { user }, doc }) => {
  if (user) {
    if (checkRole(['admin'], user)) {
      return true
    }

    if (doc?.id === user.id) {
      return true
    }
  }

  return false
}
