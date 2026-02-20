import { useCallback } from 'react'
import { socketService } from '../../../services/socket/socketService'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import {
    sendMessage as sendMessageAction,
    messageSent,
    updateMessageStatus,
    selectAllMessages,
    type Message,
    type MessageStatus,
} from '../store/chatSlice'
import { selectIsOnline } from '../../../app/network/networkSlice'
import { deleteMessage, upsertMessage, updateMessageStatusDb } from '../storage/messagesDb'

const SEND_TIMEOUT = 5000 // 5 seconds timeout

export const useSendMessage = () => {
    const dispatch = useAppDispatch()
    const messages = useAppSelector(selectAllMessages)
    const isOnline = useAppSelector(selectIsOnline)

    const send = useCallback(async (text: string, conversationId: string, userId: string) => {
        if (!text.trim()) return

        // 1. Generate Temp ID
        const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

        // 2. Optimistic Update (Redux)
        const status: MessageStatus = isOnline ? 'sending' : 'queued'
        const messagePayload: Message = {
            id: tempId,
            conversationId,
            userId,
            body: text,
            type: 'text' as const,
            status,
            createdAt: Date.now(),
            queued: !isOnline,
        }

        dispatch(sendMessageAction(messagePayload))
        void upsertMessage(messagePayload)

        // If offline, don't send now (keep status = sending); it'll be sent automatically on restore.
        if (!isOnline) return

        // 3. Emit with ACK (server calls callback) + timeout
        try {
            const ack = await socketService.emitWithAck<{ tempId: string; serverId: string; timestamp: number }>(
                'message:send',
                { ...messagePayload, queued: undefined },
                SEND_TIMEOUT
            )
            dispatch(messageSent(ack))
            void deleteMessage(tempId)
            void upsertMessage({
                ...messagePayload,
                id: ack.serverId,
                status: 'sent',
                createdAt: ack.timestamp,
                queued: undefined,
            })
        } catch (error) {
            console.warn('Message send failed/timed out:', error)
            dispatch(updateMessageStatus({ id: tempId, status: 'failed' }))
            void updateMessageStatusDb(tempId, 'failed')
        }
    }, [dispatch, isOnline])

    // --- Retry Logic ---
    const retry = useCallback(async (messageId: string) => {
        const message = messages.find(m => m.id === messageId)
        if (!message) return

        // Reset status to sending
        const nextStatus: MessageStatus = isOnline ? 'sending' : 'queued'
        dispatch(updateMessageStatus({ id: messageId, status: nextStatus }))
        void updateMessageStatusDb(messageId, nextStatus)

        if (!isOnline) return

        try {
            const ack = await socketService.emitWithAck<{ tempId: string; serverId: string; timestamp: number }>(
                'message:send',
                { ...message, queued: undefined },
                SEND_TIMEOUT
            )
            dispatch(messageSent(ack))
            void deleteMessage(messageId)
            void upsertMessage({
                ...message,
                id: ack.serverId,
                status: 'sent',
                createdAt: ack.timestamp,
                queued: undefined,
            })
        } catch (error) {
            console.warn('Retry failed/timed out:', error)
            dispatch(updateMessageStatus({ id: messageId, status: 'failed' }))
            void updateMessageStatusDb(messageId, 'failed')
        }
    }, [dispatch, isOnline, messages])

    return { send, retry }
}
