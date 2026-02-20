import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators'

export default class Message extends Model {
    static table = 'messages'
    static associations: any = {
        conversations: { type: 'belongs_to', key: 'conversation_id' },
        users: { type: 'belongs_to', key: 'user_id' },
    }

    @field('conversation_id') conversationId!: string
    @field('user_id') userId!: string
    @field('body') body!: string
    @field('type') type!: string
    @field('status') status!: string
    @date('created_at') createdAt!: number | Date

    @relation('conversations', 'conversation_id') conversation!: any
    @relation('users', 'user_id') user!: any
}
