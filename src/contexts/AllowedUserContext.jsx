import { createContext, useContext } from 'react'

// allowedUser = null（未ログイン）| false（アクセス拒否）| { nickname, role }（認証済み）
export const AllowedUserContext = createContext(null)

export function useAllowedUser() {
  return useContext(AllowedUserContext)
}
