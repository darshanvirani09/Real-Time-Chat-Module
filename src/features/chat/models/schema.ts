import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
    version: 3,
    tables: [
        tableSchema({
            name: 'app_settings',
            columns: [
                { name: 'self_id', type: 'string', isOptional: true },
                { name: 'self_name', type: 'string', isOptional: true },
                { name: 'self_mobile', type: 'string', isOptional: true },
                { name: 'socket_url', type: 'string', isOptional: true },
                { name: 'updated_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'users',
            columns: [
                { name: 'name', type: 'string' },
                { name: 'avatar', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'conversations',
            columns: [
                { name: 'name', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'last_message_at', type: 'number', isIndexed: true },
            ],
        }),
        tableSchema({
            name: 'messages',
            columns: [
                { name: 'conversation_id', type: 'string', isIndexed: true },
                { name: 'user_id', type: 'string', isIndexed: true },
                { name: 'body', type: 'string' },
                { name: 'type', type: 'string' }, // 'text', 'image'
                { name: 'status', type: 'string' }, // 'pending', 'sent', 'read'
                { name: 'created_at', type: 'number', isIndexed: true },
            ],
        }),
    ],
})
