import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

import { schema } from '../../features/chat/models/schema'
import { migrations } from './migrations'
import Message from '../../features/chat/models/Message'
import Conversation from '../../features/chat/models/Conversation'
import User from '../../features/chat/models/User'
import AppSettings from '../../features/chat/models/AppSettings'

const adapter = new SQLiteAdapter({
    schema,
    // (You might want to comment out migration events for production)
    migrations,
    jsi: true, // Faster, requires native build
    onSetUpError: error => {
        // Database failed to load -- offer the user to reload the app or log out
        console.error('Database setup failed', error)
    }
})

export const database = new Database({
    adapter,
    modelClasses: [
        Message,
        Conversation,
        User,
        AppSettings,
    ],
})
