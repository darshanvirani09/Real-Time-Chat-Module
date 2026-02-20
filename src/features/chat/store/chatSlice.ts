import {
    createSlice,
    createEntityAdapter,
    PayloadAction,
    createSelector,
} from '@reduxjs/toolkit'

// --- Types ---

export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

const STATUS_ORDER: Record<MessageStatus, number> = {
    failed: 0,
    queued: 1,
    sending: 2,
    sent: 3,
    delivered: 4,
    read: 5,
}

const mergeStatus = (current: MessageStatus | undefined, incoming: MessageStatus): MessageStatus => {
    if (!current) return incoming
    if (incoming === 'failed') return 'failed'
    if (current === 'failed') return incoming // ACK/status can override a local failure
    return STATUS_ORDER[incoming] >= STATUS_ORDER[current] ? incoming : current
}

export interface Message {
    id: string
    // When a server message corresponds to an optimistic temp message, the server can include `tempId`
    // so the client can reconcile and prevent duplicates.
    tempId?: string
    conversationId: string
    userId: string
    body: string
    type: 'text' | 'image'
    status: MessageStatus
    createdAt: number
    queued?: boolean
}

// --- Entity Adapter ---

// This automatically generates `ids` array and `entities` object
// Sort by createdAt for consistent ordering
export const messagesAdapter = createEntityAdapter<Message>({
    // Oldest-first so UI can render top->bottom chronologically (WhatsApp-style)
    sortComparer: (a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
        return a.id.localeCompare(b.id)
    },
})

// --- Slice ---

const chatSlice = createSlice({
    name: 'chat',
    initialState: messagesAdapter.getInitialState({
        loading: false,
        error: null as string | null,
    }),
    reducers: {
        // 1. Sending a message (Optimistic update)
        sendMessage: (state, action: PayloadAction<Message>) => {
            // Upsert to be resilient if the message already exists (e.g., rehydration/persistence)
            messagesAdapter.upsertOne(state, action.payload)
        },

        // 2. Message successfully sent to server (Update status & potentially ID)
        messageSent: (state, action: PayloadAction<{ tempId: string; serverId: string; timestamp: number }>) => {
            const { tempId, serverId, timestamp } = action.payload
            const existingMessage = state.entities[tempId]

            if (existingMessage) {
                const updatedMessage = {
                    ...existingMessage,
                    id: serverId,
                    status: mergeStatus(existingMessage.status, 'sent'),
                    createdAt: timestamp
                }

                messagesAdapter.removeOne(state, tempId)
                 // upsert will merge instead of creating duplicates.
                messagesAdapter.upsertOne(state, updatedMessage)
                return
            }

             // still ensure the server message is at least marked as sent.
            const serverMsg = state.entities[serverId]
            if (serverMsg) {
                messagesAdapter.updateOne(state, {
                    id: serverId,
                    changes: { status: mergeStatus(serverMsg.status, 'sent'), createdAt: timestamp },
                })
            }
        },

        // 3. Status updates (Delivered/Read)
        updateMessageStatus: (state, action: PayloadAction<{ id: string; status: MessageStatus; tempId?: string }>) => {
            const { id, status, tempId } = action.payload
            const targetId = state.entities[id] ? id : (tempId && state.entities[tempId] ? tempId : null)
            if (!targetId) return

            const current = state.entities[targetId]
            const next = mergeStatus(current?.status, status)
            messagesAdapter.updateOne(state, {
                id: targetId,
                changes: { status: next },
            })
        },

        // 4. Receive incoming message
        receiveMessage: (state, action: PayloadAction<Message>) => {
            // If this server message corresponds to an optimistic temp message, remove the temp one first.
            const incoming: any = action.payload
            const tempId = typeof incoming?.tempId === 'string' ? incoming.tempId : null
            if (tempId && tempId !== incoming.id && state.entities[tempId]) {
                messagesAdapter.removeOne(state, tempId)
            }

            // upsertOne handles deduplication if ID exists
            const { tempId: _tempId, ...rest } = incoming ?? {}
            const existing = state.entities[rest?.id]
            if (existing?.status && rest?.status) {
                rest.status = mergeStatus(existing.status, rest.status)
            }
            messagesAdapter.upsertOne(state, rest as Message)
        },

         receiveMessages: (state, action: PayloadAction<Message[]>) => {
            const sanitized: Message[] = []
            for (const msgAny of action.payload as any[]) {
                const tempId = typeof msgAny?.tempId === 'string' ? msgAny.tempId : null
                if (tempId && tempId !== msgAny.id && state.entities[tempId]) {
                    messagesAdapter.removeOne(state, tempId)
                }
                const { tempId: _tempId, ...rest } = msgAny ?? {}
                const existing = state.entities[rest?.id]
                if (existing?.status && rest?.status) {
                    rest.status = mergeStatus(existing.status, rest.status)
                }
                sanitized.push(rest as Message)
            }
            messagesAdapter.upsertMany(state, sanitized)
        },

        // Clear all chat messages
        clearAllChats: (state) => {
            messagesAdapter.removeAll(state)
        },

        // Clear messages for a specific conversation
        clearConversation: (state, action: PayloadAction<{ conversationId: string }>) => {
            const conversationId = action.payload.conversationId
            const idsToRemove: string[] = []
            for (const id of state.ids as string[]) {
                const msg = state.entities[id]
                if (msg?.conversationId === conversationId) {
                    idsToRemove.push(id)
                }
            }
            messagesAdapter.removeMany(state, idsToRemove)
        },
    },
})

export const {
    sendMessage,
    messageSent,
    updateMessageStatus,
    receiveMessage,
    receiveMessages,
    clearAllChats,
    clearConversation,
} = chatSlice.actions

export default chatSlice.reducer

// --- Selectors ---

// Built-in selectors: selectAll, selectById, selectIds
export const {
    selectAll: selectAllMessages,
    selectById: selectMessageById,
    selectIds: selectMessageIds,
} = messagesAdapter.getSelectors((state: any) => state.chat)

// Memoized Selector: Get messages for a specific conversation
export const selectMessagesByConversationId = createSelector(
    [selectAllMessages, (_state: any, conversationId: string) => conversationId],
    (messages, conversationId) =>
        messages.filter(msg => msg.conversationId === conversationId)
)

// Explanation of Normalization Benefits:
// 1. O(1) Lookup: access any message by ID instantly.
// 2. No Duplicates: `upsert` guarantees uniqueness by ID.
// 3. Flat Structure: Updates to nested data don't require deep cloning.
