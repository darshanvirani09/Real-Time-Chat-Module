import { useEffect } from 'react'
import { socketService } from '../../../services/socket/socketService'
import { useAppDispatch } from '../../../app/store'
import { setUsers, upsertUser, User } from '../store/usersSlice'

type UserListAck = { ok: boolean; users?: User[] }
type UpsertedPayload = { user: User }

export const useUsersSync = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    let unsub: (() => void) | null = null

    const load = async () => {
      try {
        const ack = await socketService.emitWithAck<UserListAck>('user:list', {}, 5000)
        if (ack?.ok && Array.isArray(ack.users)) {
          dispatch(setUsers(ack.users))
        }
      } catch {
        // ignore (offline / not connected yet)
      }
    }

    load()

    unsub = socketService.on('user:upserted', (payload: UpsertedPayload) => {
      if (!payload?.user) return
      dispatch(upsertUser(payload.user))
    })

    return () => {
      unsub?.()
    }
  }, [dispatch])
}

