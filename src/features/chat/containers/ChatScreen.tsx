import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform, ActivityIndicator, Keyboard, Animated } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'

import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectMessagesByConversationId, Message, receiveMessages } from '../store/chatSlice'
import { useChatSocket } from '../hooks/useChatSocket'
import { useSendMessage } from '../hooks/useSendMessage'
import ChatBubble from '../components/ChatBubble'
import { isServiceWindowActive } from '../utils/serviceWindow'
import type { RootStackParamList } from '../../../app/navigation/types'
import { selectSelfId } from '../../users/store/usersSlice'
import { clearConversation } from '../store/chatSlice'
import { socketService } from '../../../services/socket/socketService'
import { loadConversationLatest, upsertMessages } from '../storage/messagesDb'

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>

const PAGE_SIZE = 50
const INPUT_HORIZONTAL_PADDING = 12

const ChatScreen = ({ route }: Props) => {
    const navigation = useNavigation<any>()
    const insets = useSafeAreaInsets()

    const selfId = useAppSelector(selectSelfId)
    const dispatch = useAppDispatch()

    // 1. Connect Socket & State
    const authToken = 'dummy-token' // Replace with real token
    const { peerId, peerName, peerMobile } = route.params
    const conversationId = useMemo(() => {
        const me = selfId ?? 'unknown'
        return `dm:${[me, peerId].sort().join(':')}`
    }, [peerId, selfId])

    useChatSocket(authToken, conversationId, selfId)

    const messages = useAppSelector((state) => selectMessagesByConversationId(state, conversationId))
    const { send } = useSendMessage()

    const listRef = useRef<FlashListRef<Message> | null>(null)
    const isAtBottomRef = useRef(true)
    const didInitialScrollRef = useRef(false)
    const latestMessageIdRef = useRef<string | null>(null)
    const forceScrollToBottomOnceRef = useRef(false)

    const scrollToBottom = useCallback((animated: boolean) => {
        listRef.current?.scrollToEnd({ animated })
    }, [])

    // 2. Service Window Logic
    const isWindowOpen = useMemo(() => {
        // Actually, typical whatsapp business: 24h starts after user message.
        // "Requirements: If last customer message > 24 hours: Disable input"
        if (!selfId) return false

        const hasCustomerMessage = messages.some(m => m.userId !== selfId)
        if (!hasCustomerMessage) return true

        return isServiceWindowActive(messages, selfId)
    }, [messages, selfId])

    // 3. Local State
    const [inputText, setInputText] = useState('')
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const isLoadingHistoryRef = useRef(false)
    const lastReadEmitAtRef = useRef(0)
    const [inputBarHeight, setInputBarHeight] = useState(0)
    const [keyboardHeight, setKeyboardHeight] = useState(0)

    const keyboardTranslateY = useRef(new Animated.Value(0)).current

    // 4. Handlers
    const handleSend = () => {
        if (!inputText.trim()) return
        if (!isWindowOpen) return
        if (!selfId) return

        send(inputText, conversationId, selfId)
        setInputText('')

        forceScrollToBottomOnceRef.current = true
    }

    const loadHistory = useCallback(async (direction: 'latest' | 'older') => {
        if (!conversationId) return
        if (isLoadingHistoryRef.current) return
        if (direction === 'older' && !hasMore) return

        isLoadingHistoryRef.current = true
        setLoadingMore(true)

        const before =
            direction === 'older'
                ? (messages[0]?.createdAt ?? Date.now())
                : undefined

        try {
            const res = await socketService.emitWithAck<{
                ok: boolean
                messages?: Message[]
                hasMore?: boolean
                nextBefore?: number | null
                error?: string
            }>(
                'message:history',
                { conversationId, before, limit: PAGE_SIZE },
                7000
            )

            if (!res?.ok) {
                console.warn('message:history failed:', res?.error ?? 'unknown_error')
                return
            }

            const page = res.messages ?? []
            if (page.length) {
                dispatch(receiveMessages(page))
                void upsertMessages(page)
            }
            setHasMore(Boolean(res.hasMore))
        } catch (e) {
            console.warn('message:history error:', e)
        } finally {
            setLoadingMore(false)
            isLoadingHistoryRef.current = false
        }
    }, [conversationId, dispatch, hasMore, messages])

    const handleLoadMore = useCallback(() => {
        void loadHistory('older')
    }, [loadHistory])

    // 5. Render Item
    const renderItem = useCallback(({ item }: { item: Message }) => {
        return (
            <ChatBubble
                message={item}
                isMe={!!selfId && item.userId === selfId}
            />
        )
    }, [selfId])

    const keyExtractor = useCallback((item: Message) => item.id, [])

     useEffect(() => {
        didInitialScrollRef.current = false
        latestMessageIdRef.current = null
        isAtBottomRef.current = true
        setHasMore(true)
        isLoadingHistoryRef.current = false
        setLoadingMore(false)
    }, [conversationId])

     useEffect(() => {
        if (!conversationId) return

        let cancelled = false
            ; (async () => {
                try {
                    const local = await loadConversationLatest(conversationId, 200)
                    if (cancelled) return
                    if (local.length) dispatch(receiveMessages(local))
                } catch (e) {
                    console.warn('DB hydrate failed:', e)
                }
            })()

        return () => {
            cancelled = true
        }
    }, [conversationId, dispatch])

     useEffect(() => {
        if (!conversationId) return
        void loadHistory('latest')
    }, [conversationId, loadHistory])

    useEffect(() => {
        if (didInitialScrollRef.current) return
        if (messages.length === 0) return

        didInitialScrollRef.current = true
        requestAnimationFrame(() => scrollToBottom(false))
    }, [messages.length, scrollToBottom])

     useEffect(() => {
        if (!selfId) return
        if (!conversationId) return
        if (messages.length === 0) return
        if (!isAtBottomRef.current) return

        const hasUnreadFromOther = messages.some(m => m.userId !== selfId && m.status !== 'read')
        if (!hasUnreadFromOther) return

        const now = Date.now()
        if (now - lastReadEmitAtRef.current < 1500) return
        lastReadEmitAtRef.current = now

        socketService.emitBuffered('conversation:read', { conversationId, userId: selfId })
    }, [conversationId, messages, selfId])

    useEffect(() => {
        const latestId = messages[messages.length - 1]?.id ?? null // oldest-first
        if (!latestId) return

        const prevLatestId = latestMessageIdRef.current
        latestMessageIdRef.current = latestId

        if (prevLatestId === null) return
        if (prevLatestId === latestId) return

        if (forceScrollToBottomOnceRef.current) {
            forceScrollToBottomOnceRef.current = false
            requestAnimationFrame(() => scrollToBottom(true))
            return
        }

        if (isAtBottomRef.current) {
            requestAnimationFrame(() => scrollToBottom(true))
        }
    }, [messages, scrollToBottom])

    // Keep the input visible above the keyboard on Android/iOS reliably.
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

        const onShow = (e: any) => {
            const height = e?.endCoordinates?.height ?? 0
            const duration = typeof e?.duration === 'number' ? e.duration : 180
            setKeyboardHeight(height)
            Animated.timing(keyboardTranslateY, {
                toValue: -height,
                duration,
                useNativeDriver: true,
            }).start()
        }

        const onHide = (e: any) => {
            const duration = typeof e?.duration === 'number' ? e.duration : 180
            setKeyboardHeight(0)
            Animated.timing(keyboardTranslateY, {
                toValue: 0,
                duration,
                useNativeDriver: true,
            }).start()
        }

        const subShow = Keyboard.addListener(showEvent as any, onShow)
        const subHide = Keyboard.addListener(hideEvent as any, onHide)

        return () => {
            subShow.remove()
            subHide.remove()
        }
    }, [keyboardTranslateY])

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => dispatch(clearConversation({ conversationId }))}
                        style={styles.clearChatButton}
                    >
                        <Text style={styles.clearChatButtonText}>Clear</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{peerName}</Text>
                    <Text style={styles.headerSubtitle}>{peerMobile}</Text>
                </View>

                {/* Service Window Banner */}
                {!isWindowOpen && (
                    <View style={styles.banner}>
                        <Text style={styles.bannerText}>
                            24-hour session expired. You cannot reply to this conversation.
                        </Text>
                    </View>
                )}

                <FlashList
                    ref={listRef}
                    data={messages}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    style={styles.list}
                    maintainVisibleContentPosition={{
                        startRenderingFromBottom: true,
                        autoscrollToBottomThreshold: 48,
                        animateAutoScrollToBottom: true,
                    }}
                    onStartReached={handleLoadMore}
                    onStartReachedThreshold={0.2}
                    ListHeaderComponent={loadingMore ? <ActivityIndicator size="small" /> : null}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[
                        styles.listContent,
                        // Reserve space for input + keyboard so the last messages never hide behind them.
                        { paddingBottom: 16 + inputBarHeight + insets.bottom + keyboardHeight },
                    ]}
                    onScroll={(e) => {
                        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
                        const threshold = 48
                        const distanceFromBottom =
                            contentSize.height - (contentOffset.y + layoutMeasurement.height)
                        isAtBottomRef.current = distanceFromBottom <= threshold
                    }}
                    scrollEventThrottle={16}
                />

                <Animated.View
                    style={[
                        styles.inputDock,
                        { paddingBottom: insets.bottom, transform: [{ translateY: keyboardTranslateY }] },
                    ]}
                    onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}
                >
                    <View style={[styles.inputContainer, !isWindowOpen && styles.disabledInput]}>
                        <TextInput
                            style={[styles.input, !isWindowOpen && styles.disabledTextInput]}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={isWindowOpen ? "Type a message..." : "Messaging unavailable"}
                            placeholderTextColor="#8E8E93"
                            selectionColor="#007AFF"
                            editable={isWindowOpen && !!selfId}
                            multiline
                            textAlignVertical="center"
                        />
                        <TouchableOpacity
                            onPress={handleSend}
                            style={[styles.sendButton, !isWindowOpen && styles.disabledButton]}
                            disabled={!isWindowOpen || !selfId}
                        >
                            <Text style={styles.sendButtonText}>Send</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f2f7',
    },
    header: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButton: {
        position: 'absolute',
        left: 12,
        top: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#f2f2f7',
    },
    clearChatButton: {
        position: 'absolute',
        right: 12,
        top: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#f2f2f7',
    },
    backButtonText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#111',
    },
    clearChatButtonText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#111',
    },
    headerTitle: {
        fontWeight: 'bold',
        fontSize: 18
    },
    headerSubtitle: {
        marginTop: 6,
        color: '#666',
        fontSize: 12,
        fontWeight: '600',
    },
    banner: {
        backgroundColor: '#FFF4E5',
        padding: 10,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#FFE0B2'
    },
    bannerText: {
        color: '#D84315',
        fontSize: 12,
        fontWeight: '600'
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingVertical: 16,
    },
    inputDock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        paddingHorizontal: INPUT_HORIZONTAL_PADDING,
        paddingTop: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        paddingBottom: 10,
        alignItems: 'center'
    },
    disabledInput: {
        backgroundColor: '#f0f0f0'
    },
    input: {
        flex: 1,
        backgroundColor: '#f2f2f7',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 10,
        maxHeight: 110,
        minHeight: 44,
        fontSize: 16,
        color: '#111',
    },
    disabledTextInput: {
        color: '#999'
    },
    sendButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    disabledButton: {
        backgroundColor: '#A0A0A0'
    },
    sendButtonText: {
        color: '#fff',
        fontWeight: 'bold'
    }
})

export default ChatScreen
