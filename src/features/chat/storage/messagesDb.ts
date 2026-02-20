import { Q } from '@nozbe/watermelondb'
import { database } from '../../../services/database'
import type { Message, MessageStatus } from '../store/chatSlice'

const TABLE = 'messages'

const toTimestamp = (value: any): number => {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const t = Number(value)
  return Number.isFinite(t) ? t : Date.now()
}

const toPlainMessage = (record: any): Message => ({
  id: String(record.id),
  conversationId: String(record.conversationId ?? record.conversation_id),
  userId: String(record.userId ?? record.user_id),
  body: String(record.body ?? ''),
  type: (record.type ?? 'text') as Message['type'],
  status: String(record.status ?? 'sent') as MessageStatus,
  createdAt: toTimestamp(record.createdAt),
})

export const upsertMessage = async (message: Message): Promise<void> => {
  await database.write(async () => {
    const collection: any = database.get(TABLE)
    let record: any = null

    try {
      record = await collection.find(message.id)
    } catch {
      record = null
    }

    if (!record) {
      await collection.create((r: any) => {
        r._raw.id = message.id
        r.conversationId = message.conversationId
        r.userId = message.userId
        r.body = message.body
        r.type = message.type
        r.status = message.status
        r.createdAt = message.createdAt
      })
      return
    }

    await record.update((r: any) => {
      r.conversationId = message.conversationId
      r.userId = message.userId
      r.body = message.body
      r.type = message.type
      r.status = message.status
      r.createdAt = message.createdAt
    })
  })
}

export const upsertMessages = async (messages: Message[]): Promise<void> => {
  if (!messages.length) return
  await database.write(async () => {
    const collection: any = database.get(TABLE)

    for (const message of messages) {
      let record: any = null
      try {
        record = await collection.find(message.id)
      } catch {
        record = null
      }

      if (!record) {
        await collection.create((r: any) => {
          r._raw.id = message.id
          r.conversationId = message.conversationId
          r.userId = message.userId
          r.body = message.body
          r.type = message.type
          r.status = message.status
          r.createdAt = message.createdAt
        })
        continue
      }

      await record.update((r: any) => {
        r.conversationId = message.conversationId
        r.userId = message.userId
        r.body = message.body
        r.type = message.type
        r.status = message.status
        r.createdAt = message.createdAt
      })
    }
  })
}

export const deleteMessage = async (id: string): Promise<void> => {
  await database.write(async () => {
    const collection: any = database.get(TABLE)
    let record: any = null
    try {
      record = await collection.find(id)
    } catch {
      record = null
    }
    if (!record) return
    await record.destroyPermanently()
  })
}

export const updateMessageStatusDb = async (id: string, status: MessageStatus): Promise<void> => {
  await database.write(async () => {
    const collection: any = database.get(TABLE)
    let record: any = null
    try {
      record = await collection.find(id)
    } catch {
      record = null
    }
    if (!record) return
    await record.update((r: any) => {
      r.status = status
    })
  })
}

export const loadConversationLatest = async (conversationId: string, limit = 100): Promise<Message[]> => {
  const collection: any = database.get(TABLE)
  const records = await collection.query(
    Q.where('conversation_id', conversationId),
    Q.sortBy('created_at', Q.desc),
    Q.take(limit)
  ).fetch()

  // return oldest->newest for stable insertion
  return records.map(toPlainMessage).reverse()
}

export const loadConversationOlderThan = async (
  conversationId: string,
  before: number,
  limit = 100
): Promise<Message[]> => {
  const collection: any = database.get(TABLE)
  const records = await collection.query(
    Q.where('conversation_id', conversationId),
    Q.where('created_at', Q.lt(before)),
    Q.sortBy('created_at', Q.desc),
    Q.take(limit)
  ).fetch()

  return records.map(toPlainMessage).reverse()
}

export const loadPendingOutgoing = async (limit = 200): Promise<Message[]> => {
  const collection: any = database.get(TABLE)
  const records = await collection.query(
    Q.where('status', Q.oneOf(['queued', 'failed', 'sending'])),
    Q.sortBy('created_at', Q.asc),
    Q.take(limit)
  ).fetch()

  return records.map(toPlainMessage)
}

