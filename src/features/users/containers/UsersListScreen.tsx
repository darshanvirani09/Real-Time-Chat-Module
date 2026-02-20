import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import type { RootStackParamList } from '../../../app/navigation/types'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectSelfId, selectUsers, selectSelfProfile, setSelfProfile, upsertUser, User } from '../store/usersSlice'
import { useUsersSync } from '../hooks/useUsersSync'
import { socketService } from '../../../services/socket/socketService'
import { loadSelfProfile, saveSelfProfile } from '../storage/selfProfileDb'
import { clearAllChats, clearConversation } from '../../chat/store/chatSlice'
import { loadSocketUrl, saveSocketUrl } from '../../../app/settings/socketUrlDb'
import { CONFIG } from '../../../config'

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>

const UsersListScreen = ({ navigation }: Props) => {
  useUsersSync()

  const dispatch = useAppDispatch()
  const users = useAppSelector(selectUsers)
  const selfId = useAppSelector(selectSelfId)
  const selfProfile = useAppSelector(selectSelfProfile)
  const [myName, setMyName] = useState('')
  const [myMobile, setMyMobile] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [isApplyingServer, setIsApplyingServer] = useState(false)
  const [socketConnected, setSocketConnected] = useState(socketService.isConnected())

  useEffect(() => {
    // Load persistent "Me" once.
    if (selfProfile) return
    loadSelfProfile().then((p) => {
      if (!p) return
      dispatch(setSelfProfile(p))
      setMyName(p.name)
      setMyMobile(p.mobile)
    })
  }, [dispatch, selfProfile])

  useEffect(() => {
    loadSocketUrl().then((u) => {
      setServerUrl(u ?? socketService.getCurrentUrl() ?? CONFIG.SOCKET_URL)
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSocketConnected(socketService.isConnected()), 800)
    return () => clearInterval(id)
  }, [])

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => b.createdAt - a.createdAt)
  }, [users])

  const applyServer = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('Required', 'Enter server URL (ngrok / tunnel URL)')
      return
    }

    setIsApplyingServer(true)
    try {
      const normalized = await saveSocketUrl(serverUrl)
      socketService.connect(normalized, CONFIG.AUTH_TOKEN)
      await socketService.ensureConnected(8000)
      Alert.alert('Connected', 'Server is set. You can save Me and start chatting.')
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'websocket error')
    } finally {
      setIsApplyingServer(false)
    }
  }

  const saveMe = async () => {
    if (!myName.trim() || !myMobile.trim()) {
      Alert.alert('Required', 'Enter your name and mobile number')
      return
    }

    try {
      await socketService.ensureConnected(8000)
      const ack = await socketService.emitWithAck<{ ok: boolean; user?: any; error?: string }>(
        'user:upsert',
        { name: myName, mobile: myMobile },
        5000
      )

      if (!ack?.ok || !ack.user) {
        Alert.alert('Failed', ack?.error ?? 'Unable to save')
        return
      }

      const me = { id: ack.user.id, name: ack.user.name, mobile: ack.user.mobile }
      dispatch(setSelfProfile(me))
      dispatch(upsertUser(ack.user))
      await saveSelfProfile(me)
      setMyName('')
      setMyMobile('')
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Unable to save')
    }
  }

  const clearAll = useCallback(() => {
    Alert.alert('Clear chats', 'Delete all chat messages from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => dispatch(clearAllChats()) },
    ])
  }, [dispatch])

  // useLayoutEffect(() => {
  //   navigation.setOptions({
  // headerRight: () => (
  //   <TouchableOpacity
  //     onPress={clearAll}
  //     style={styles.headerClearButton}
  //     hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  //   >
  //     <Text style={styles.headerClearButtonText}>Clear All</Text>
  //   </TouchableOpacity>
  // ),
  //   })
  // }, [clearAll, navigation])

  const openChat = (user: User) => {
    if (!selfId) {
      Alert.alert('Set your number', 'First set your name and mobile number (Me) to start chatting.')
      return
    }
    navigation.navigate('Chat', { peerId: user.id, peerName: user.name, peerMobile: user.mobile })
  }

  const clearChatWith = (user: User) => {
    if (!selfId) return
    const conversationId = `dm:${[selfId, user.id].sort().join(':')}`
    Alert.alert('Clear chat', `Clear chat with ${user.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => dispatch(clearConversation({ conversationId })) },
    ])
  }

  const filtered = useMemo(() => {
    if (!selfId) return sorted
    return sorted.filter((u) => u.id !== selfId)
  }, [sorted, selfId])

  return (
    <KeyboardAwareFlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      style={{ flex: 1, backgroundColor: '#f2f2f7' }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={20}
      ListHeaderComponent={
        <>
          <View style={styles.meCard}>
            <View style={styles.serverHeaderRow}>
              <Text style={styles.meTitle}>Server</Text>
              <View style={[styles.serverChip, socketConnected ? styles.serverChipOn : styles.serverChipOff]}>
                <Text style={styles.serverChipText}>{socketConnected ? 'Live' : 'Offline'}</Text>
              </View>
            </View>
            <Text style={styles.meHint}>Paste your ngrok/cloudflared URL here once (saved on device)</Text>

            <View style={styles.meRow}>
              <TextInput
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="https://xxxx.ngrok-free.dev"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.meInput}
              />
            </View>

            <TouchableOpacity
              style={[styles.meButton, isApplyingServer && styles.meButtonDisabled]}
              onPress={applyServer}
              disabled={isApplyingServer}
            >
              <Text style={styles.meButtonText}>{isApplyingServer ? 'Connecting...' : 'Apply'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.meCard}>
            <Text style={styles.meTitle}>Me</Text>
            {selfId ? <Text style={styles.meHint}>Your ID: {selfId}</Text> : <Text style={styles.meHint}>Set your name + mobile to chat</Text>}

            <View style={styles.meRow}>
              <TextInput value={myName} onChangeText={setMyName} placeholder="Your name" style={styles.meInput} />
              <TextInput value={myMobile} onChangeText={setMyMobile} placeholder="Your mobile" keyboardType="phone-pad" style={styles.meInput} />
            </View>

            <TouchableOpacity style={styles.meButton} onPress={saveMe}>
              <Text style={styles.meButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddUser')}>
            <Text style={styles.addButtonText}>+ Add User</Text>
          </TouchableOpacity>
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No users yet</Text>
          <Text style={styles.emptyText}>Tap “Add User” to start a chat.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.row} onPress={() => openChat(item)} onLongPress={() => clearChatWith(item)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.mobile}>{item.mobile}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    padding: 16,
  },
  meCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e7e7ee',
  },
  meTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111',
  },
  meHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  meRow: {
    marginTop: 10,
    gap: 8,
  },
  meInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  meButton: {
    marginTop: 10,
    backgroundColor: '#111',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  meButtonDisabled: {
    backgroundColor: '#666',
  },
  meButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  serverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serverChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  serverChipOn: {
    backgroundColor: '#E6F7EC',
    borderColor: '#BCE6C9',
  },
  serverChipOff: {
    backgroundColor: '#FFF4E5',
    borderColor: '#FFE0B2',
  },
  serverChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  headerClearButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  headerClearButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    color: '#111',
  },
  emptyText: {
    color: '#555',
  },
  list: {
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#007AFF',
    fontWeight: '900',
    fontSize: 16,
  },
  rowBody: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },
  mobile: {
    marginTop: 2,
    color: '#555',
  },
  chev: {
    fontSize: 22,
    color: '#999',
    paddingHorizontal: 6,
  },
})

export default UsersListScreen
