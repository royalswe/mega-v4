interface RoleCarrier {
  roles?: (string | null)[] | null
}

export const checkRole = (allRoles: string[] = [], user: RoleCarrier | null = null): boolean => {
  if (user) {
    if (
      allRoles?.some((role) => {
        return user?.roles?.some((individualRole) => {
          return individualRole === role
        })
      })
    ) {
      return true
    }
  }

  return false
}
