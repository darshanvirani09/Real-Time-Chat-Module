import { database } from '../../services/database'

const TABLE = 'app_settings'
const ROW_ID = 'self'

const normalizeUrl = (value: string): string => {
  const raw = String(value ?? '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) return `http://${raw}`
  return raw
}

export const loadSocketUrl = async (): Promise<string | null> => {
  try {
    const record: any = await (database.get(TABLE) as any).find(ROW_ID)
    const url = normalizeUrl(String(record?.socketUrl ?? record?.socket_url ?? ''))
    return url || null
  } catch {
    return null
  }
}

export const saveSocketUrl = async (socketUrl: string): Promise<string> => {
  const normalized = normalizeUrl(socketUrl)

  await database.write(async () => {
    const collection: any = database.get(TABLE)
    let record: any = null

    try {
      record = await collection.find(ROW_ID)
    } catch {
      record = null
    }

    if (!record) {
      await collection.create((r: any) => {
        r._raw.id = ROW_ID
        r.socketUrl = normalized || null
        r.updatedAt = Date.now()
      })
      return
    }

    await record.update((r: any) => {
      r.socketUrl = normalized || null
      r.updatedAt = Date.now()
    })
  })

  return normalized
}

