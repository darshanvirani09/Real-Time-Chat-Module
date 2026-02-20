import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectIsOnline } from '../../../app/network/networkSlice'
import { socketService } from '../../../services/socket/socketService'
import { messageSent, receiveMessages, updateMessageStatus } from '../store/chatSlice'
import { deleteMessage, loadPendingOutgoing, upsertMessage, updateMessageStatusDb } from '../storage/messagesDb'

const SEND_TIMEOUT = 5000
const STALE_SENDING_AFTER_MS = SEND_TIMEOUT * 2

export const useOutgoingQueueProcessor = () => {
  const dispatch = useAppDispatch()
  const isOnline = useAppSelector(selectIsOnline)
  const isRunningRef = useRef(false)

  useEffect(() => {
    if (!isOnline) return
    if (isRunningRef.current) return

    isRunningRef.current = true

    const run = async () => {
      try {
        await socketService.ensureConnected(7000)

        const pending = await loadPendingOutgoing(200)
        const now = Date.now()
        const toSend = pending.filter(m =>
          m.status === 'queued' ||
          m.status === 'failed' ||
          (m.status === 'sending' && now - m.createdAt > STALE_SENDING_AFTER_MS)
        )

        if (toSend.length) dispatch(receiveMessages(toSend))

        for (const msg of toSend) {
          dispatch(updateMessageStatus({ id: msg.id, status: 'sending' }))
          await updateMessageStatusDb(msg.id, 'sending')

          try {
            const ack = await socketService.emitWithAck<{ tempId: string; serverId: string; timestamp: number }>(
              'message:send',
              { ...msg, queued: undefined },
              SEND_TIMEOUT
            )

            dispatch(messageSent(ack))
            await deleteMessage(msg.id)
            await upsertMessage({
              ...msg,
              id: ack.serverId,
              status: 'sent',
              createdAt: ack.timestamp,
              queued: undefined,
            })
          } catch (e) {
            dispatch(updateMessageStatus({ id: msg.id, status: 'failed' }))
            await updateMessageStatusDb(msg.id, 'failed')
          }
        }
      } catch (e) {
        // Socket not ready or DB failed; we'll try again on next network restore.
        console.warn('Outgoing queue processor failed:', e)
      } finally {
        isRunningRef.current = false
      }
    }

    void run()
  }, [dispatch, isOnline])
}

