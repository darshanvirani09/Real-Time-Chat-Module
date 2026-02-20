import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Message } from '../store/chatSlice'

interface ChatBubbleProps {
    message: Message
    isMe: boolean
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isMe }) => {
    return (
        <View
            style={[
                styles.container,
                isMe ? styles.rightContainer : styles.leftContainer,
            ]}
        >
            <View
                style={[
                    styles.bubble,
                    isMe ? styles.rightBubble : styles.leftBubble,
                ]}
            >
                <Text style={[styles.text, isMe ? styles.rightText : styles.leftText]}>
                    {message.body}
                </Text>
                <View style={styles.footer}>
                    <Text style={styles.time}>
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {/* Only show status for my messages */}
                    {isMe && (
                        <Text style={styles.status}>
                            {message.status}
                        </Text>
                    )}
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        width: '100%',
    },
    leftContainer: {
        alignItems: 'flex-start',
    },
    rightContainer: {
        alignItems: 'flex-end',
    },
    bubble: {
        borderRadius: 16,
        padding: 12,
        maxWidth: '80%',
    },
    leftBubble: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 2,
    },
    rightBubble: {
        backgroundColor: '#007AFF',
        borderBottomRightRadius: 2,
    },
    text: {
        fontSize: 16,
    },
    leftText: {
        color: '#000',
    },
    rightText: {
        color: '#fff',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 4,
        gap: 4
    },
    time: {
        fontSize: 10,
        color: 'rgba(0,0,0,0.5)'
    },
    status: {
        fontSize: 10,
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.7)'
    }
})

export default React.memo(ChatBubble)
