import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type User = {
  id: string
  name: string
  mobile: string
  createdAt: number
  updatedAt?: number
}

const normalizeMobile = (mobile: string) => mobile.replace(/[^\d+]/g, '').trim()

type UsersState = {
  users: User[]
  self: { id: string; name: string; mobile: string } | null
}

const initialState: UsersState = {
  users: [],
  self: null,
}

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setSelfProfile: (state, action: PayloadAction<{ id: string; name: string; mobile: string }>) => {
      state.self = {
        id: normalizeMobile(action.payload.id),
        name: action.payload.name.trim(),
        mobile: normalizeMobile(action.payload.mobile),
      }
    },
    setUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload
    },
    upsertUser: (state, action: PayloadAction<User>) => {
      const incoming = action.payload
      const id = normalizeMobile(incoming.id ?? incoming.mobile)
      const mobile = normalizeMobile(incoming.mobile)
      const next = { ...incoming, id, mobile }

      const index = state.users.findIndex((u) => u.id === id)
      if (index >= 0) {
        state.users[index] = { ...state.users[index], ...next }
      } else {
        state.users.unshift(next)
      }
    },
  },
})

export const { setSelfProfile, setUsers, upsertUser } = usersSlice.actions
export default usersSlice.reducer

export const selectUsers = (state: any): User[] => state.users.users
export const selectSelfId = (state: any): string | null => state.users.self?.id ?? null
export const selectSelfProfile = (state: any): UsersState['self'] => state.users.self
