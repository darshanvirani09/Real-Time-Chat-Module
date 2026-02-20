import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type NetworkStatus = 'unknown' | 'online' | 'offline'

type NetworkState = {
  status: NetworkStatus
  lastChangedAt: number
  banner: { type: 'offline' | 'restored'; message: string } | null
}

const initialState: NetworkState = {
  status: 'unknown',
  lastChangedAt: Date.now(),
  banner: null,
}

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setNetworkStatus: (state, action: PayloadAction<NetworkStatus>) => {
      if (state.status === action.payload) return

      const prev = state.status
      state.status = action.payload
      state.lastChangedAt = Date.now()

      if (action.payload === 'offline') {
        state.banner = { type: 'offline', message: 'Network off • Messages queued' }
      } else if (action.payload === 'online' && prev === 'offline') {
        state.banner = { type: 'restored', message: 'Back online • Sending queued messages…' }
      }
    },
    clearBanner: (state) => {
      state.banner = null
    },
  },
})

export const { setNetworkStatus, clearBanner } = networkSlice.actions
export default networkSlice.reducer

export const selectNetworkStatus = (state: any): NetworkStatus => state.network.status
// Treat 'unknown' as online so messages don't get stuck in "sending" at app start.
export const selectIsOnline = (state: any): boolean => state.network.status !== 'offline'
export const selectNetworkBanner = (state: any): NetworkState['banner'] => state.network.banner
