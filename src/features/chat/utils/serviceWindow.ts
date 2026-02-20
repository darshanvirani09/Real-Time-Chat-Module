import { Message } from '../store/chatSlice'

export const SERVICE_WINDOW_HOURS = 24
export const MS_IN_HOUR = 60 * 60 * 1000

/**
 * Checks if the 24-hour service window is open.
 * The window is open if the LAST message from the CUSTOMER (not 'me') 
 * was received within the last 24 hours.
 * 
 * @param messages List of messages (assumed sorted or unsorted, we need to find last)
 * @param currentUserId The ID of the current user (Agent)
 * @returns boolean
 */
export const isServiceWindowActive = (messages: Message[], currentUserId: string): boolean => {
    // 1. Find the last message from a user that is NOT the current user
 
    let lastCustomerMessageTimestamp: number | null = null

    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].userId !== currentUserId) {
            lastCustomerMessageTimestamp = messages[i].createdAt
            break
        }
    }

    // If no customer message exists, window is arguably closed (or open depending on policy? usually closed if initiated by business)
     if (!lastCustomerMessageTimestamp) {
        return false
    }

    // 2. Check time difference
    const now = Date.now()
    const diff = now - lastCustomerMessageTimestamp
    const diffHours = diff / MS_IN_HOUR

    return diffHours < SERVICE_WINDOW_HOURS
}

export const getTimeRemaining = (lastTimestamp: number): string => {
    const now = Date.now()
    const expiresAt = lastTimestamp + (24 * MS_IN_HOUR)
    const diff = expiresAt - now

    if (diff <= 0) return 'Expired'

    const hours = Math.floor(diff / MS_IN_HOUR)
    const minutes = Math.floor((diff % MS_IN_HOUR) / (60 * 1000))

    return `${hours}h ${minutes}m`
}
