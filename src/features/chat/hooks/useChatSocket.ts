
import { useEffect, useCallback, useRef } from 'react'
import { socketService } from '../../../services/socket/socketService'
import { useAppDispatch } from '../../../app/store'
import {
    receiveMessage,
    messageSent,
    updateMessageStatus,
    Message,
    MessageStatus
} from '../store/chatSlice'
import { deleteMessage, upsertMessage, updateMessageStatusDb } from '../storage/messagesDb'

export const useChatSocket = (
    authToken: string | null,
    conversationId?: string | null,
    selfId?: string | null
) => {
    const dispatch = useAppDispatch()
    const joinedConversationId = useRef<string | null>(null)

    // Memoized handlers to prevent re-attaching listeners unnecessarily
    const handleNewMessage = useCallback((message: Message) => {
        dispatch(receiveMessage(message))

        // Persist (best-effort) and clean up any matching optimistic temp row
        const tempId = typeof (message as any)?.tempId === 'string' ? (message as any).tempId : null
        if (tempId) void deleteMessage(tempId)
        const { tempId: _tempId, ...rest } = (message as any) ?? {}
        void upsertMessage(rest as Message)

        // Best-effort delivery receipt for incoming messages
        if (selfId && message?.conversationId && message.userId !== selfId) {
            socketService.emitBuffered('message:delivered', {
                conversationId: message.conversationId,
                id: message.id,
            })
        }
        // Optional: Trigger Haptics or Sound here
    }, [dispatch, selfId])

    const handleMessageSent = useCallback((ack: { tempId: string; serverId: string; timestamp: number }) => {
        dispatch(messageSent(ack))
    }, [dispatch])

    const handleStatusUpdate = useCallback((update: { id: string; status: MessageStatus; tempId?: string }) => {
        dispatch(updateMessageStatus(update))
        void updateMessageStatusDb(update.id, update.status)
        if (update.tempId) void updateMessageStatusDb(update.tempId, update.status)
    }, [dispatch])

     useEffect(() => {
        if (!authToken) return
        if (!conversationId) return

        if (joinedConversationId.current && joinedConversationId.current !== conversationId) {
            if (socketService.isInitialized()) {
                socketService.emitBuffered('conversation:leave', { conversationId: joinedConversationId.current })
            }
        }

        joinedConversationId.current = conversationId
        if (socketService.isInitialized()) {
            socketService.emitBuffered('conversation:join', { conversationId })
        }

        return () => {
            if (joinedConversationId.current === conversationId) {
                if (socketService.isInitialized()) {
                    socketService.emitBuffered('conversation:leave', { conversationId })
                }
                joinedConversationId.current = null
            }
        }
    }, [authToken, conversationId])

    // --- Socket Lifecycle & Events ---
    useEffect(() => {
        if (!authToken) return

        // Subscribe to events (socket connection is managed at the app level)
        const unsubNewMsg = socketService.on('message:new', handleNewMessage)
        const unsubMsgSent = socketService.on('message:sent', handleMessageSent)
        const unsubStatusUser = socketService.on('message:status', handleStatusUpdate)

        // Cleanup on unmount or token change
        return () => {
            if (joinedConversationId.current) {
                socketService.emitBuffered('conversation:leave', { conversationId: joinedConversationId.current })
                joinedConversationId.current = null
            }
            unsubNewMsg()
            unsubMsgSent()
            unsubStatusUser()
        }
    }, [authToken, handleNewMessage, handleMessageSent, handleStatusUpdate])
}
