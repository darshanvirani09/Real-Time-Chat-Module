import { Model } from '@nozbe/watermelondb'
import { field, date, children } from '@nozbe/watermelondb/decorators'

export default class Conversation extends Model {
    static table = 'conversations'
    static associations: any = {
        messages: { type: 'has_many', foreignKey: 'conversation_id' },
    }

    @field('name') name!: string | null
    @date('created_at') createdAt!: number | Date
    @date('updated_at') updatedAt!: number | Date
    @date('last_message_at') lastMessageAt!: number | Date

    @children('messages') messages!: any
}
