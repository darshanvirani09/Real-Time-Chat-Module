import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Alert, Linking, StyleSheet, View } from 'react-native'
import { Provider } from 'react-redux'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'

import { store } from './src/app/store'
import { AppNavigator } from './src/app/navigation/AppNavigator'
import { socketService } from './src/services/socket/socketService'
import { CONFIG } from './src/config'
import { useNetworkWatcher } from './src/app/network/useNetworkWatcher'
import { NetworkBanner } from './src/app/components/NetworkBanner'
import { useOutgoingQueueProcessor } from './src/features/chat/hooks/useOutgoingQueueProcessor'
import { loadSocketUrl, saveSocketUrl } from './src/app/settings/socketUrlDb'

export default function App() {
  useEffect(() => {
    // Keep a single socket connection for the whole app session.
    // `connect()` is idempotent for the same URL in `socketService`.
    let cancelled = false
    ;(async () => {
      const savedUrl = await loadSocketUrl()
      if (cancelled) return
      socketService.connect(savedUrl ?? CONFIG.SOCKET_URL, CONFIG.AUTH_TOKEN)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer>
          <View style={styles.container}>
            <AppNetwork />
            <StatusBar style="auto" />
          </View>
        </NavigationContainer>
      </SafeAreaProvider>
    </Provider>
  )
}

const AppNetwork = () => {
  useNetworkWatcher()
  useOutgoingQueueProcessor()

  useEffect(() => {
    const applyFromUrl = async (incomingUrl: string) => {
      try {
        const parsed = new URL(incomingUrl)
        if (parsed.protocol !== 'realtimechat:') return

        // Supported:
        // - realtimechat://set-server?url=http://192.168.1.10:3000
        // - realtimechat://set-server?url=https://xxxx.ngrok-free.app
        const action = (parsed.hostname || '').toLowerCase()
        if (action !== 'set-server') return

        const url = parsed.searchParams.get('url')
        if (!url) return

        const normalized = await saveSocketUrl(url)
        socketService.connect(normalized, CONFIG.AUTH_TOKEN)
        await socketService.ensureConnected(8000)
        Alert.alert('Connected', `Server set to: ${normalized}`)
      } catch (e: any) {
        Alert.alert('Failed', e?.message ?? 'Unable to apply server URL')
      }
    }

    const sub = Linking.addEventListener('url', (event) => {
      void applyFromUrl(event.url)
    })

    Linking.getInitialURL()
      .then((u) => {
        if (!u) return
        void applyFromUrl(u)
      })
      .catch(() => { })

    return () => sub.remove()
  }, [])

  return (
    <>
      <NetworkBanner />
      <AppNavigator />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
})
