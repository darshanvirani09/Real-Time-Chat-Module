import { useEffect, useRef } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

import { useAppDispatch } from '../store'
import { clearBanner, setNetworkStatus } from './networkSlice'
import { socketService } from '../../services/socket/socketService'
import { CONFIG } from '../../config'

export const useNetworkWatcher = () => {
  const dispatch = useAppDispatch()
  const lastStatus = useRef<'unknown' | 'online' | 'offline'>('unknown')
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onState = (state: NetInfoState) => {
      const status: 'unknown' | 'online' | 'offline' =
        state.isConnected === false ? 'offline' : state.isConnected === true ? 'online' : 'unknown'

      if (status === lastStatus.current) return
      lastStatus.current = status

      dispatch(setNetworkStatus(status))

      if (status === 'online') {
        // Ensure socket is connected again after network restoration.
        socketService.connect(socketService.getCurrentUrl() ?? CONFIG.SOCKET_URL, CONFIG.AUTH_TOKEN)

        if (bannerTimer.current) clearTimeout(bannerTimer.current)
        bannerTimer.current = setTimeout(() => {
          dispatch(clearBanner())
          bannerTimer.current = null
        }, 2000)
      } else if (status === 'offline') {
        if (bannerTimer.current) {
          clearTimeout(bannerTimer.current)
          bannerTimer.current = null
        }
      }
    }

    // Prime initial status quickly (before the first subscription event)
    NetInfo.fetch().then(onState).catch(() => { })
    const unsubscribe = NetInfo.addEventListener(onState)

    return () => {
      unsubscribe()
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    }
  }, [dispatch])
}
