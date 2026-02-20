import { database } from '../../../services/database'

type SelfProfile = { id: string; name: string; mobile: string }

const TABLE = 'app_settings'
const ROW_ID = 'self'

export const loadSelfProfile = async (): Promise<SelfProfile | null> => {
  try {
    const record: any = await (database.get(TABLE) as any).find(ROW_ID)
    if (!record?.selfId || !record?.selfName || !record?.selfMobile) return null
    return {
      id: String(record.selfId),
      name: String(record.selfName),
      mobile: String(record.selfMobile),
    }
  } catch {
    return null
  }
}

export const saveSelfProfile = async (profile: SelfProfile): Promise<void> => {
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
        r.selfId = profile.id
        r.selfName = profile.name
        r.selfMobile = profile.mobile
        r.updatedAt = Date.now()
      })
      return
    }

    await record.update((r: any) => {
      r.selfId = profile.id
      r.selfName = profile.name
      r.selfMobile = profile.mobile
      r.updatedAt = Date.now()
    })
  })
}

