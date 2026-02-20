import { io, Socket } from 'socket.io-client'
import { Platform } from 'react-native'

type Message = any // Replace with your Message type

class SocketService {
    private static instance: SocketService
    private socket: Socket | null = null
    private currentUrl: string | null = null
    private currentAuthToken: string | null = null
    private triedAdbReverseFallback = false
    private listeners: Map<string, Function[]> = new Map()

    private constructor() { }

    // Singleton Pattern
    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService()
        }
        return SocketService.instance
    }

    // Connect with Exponential Backoff Configuration
    public connect(url: string, authToken: string): void {
        if (this.socket) {
            if (this.currentUrl !== url) {
                this.disconnect()
            } else {
                // Update auth and reconnect if needed
                this.socket.auth = { token: authToken }
                this.currentAuthToken = authToken
                if (!this.socket.connected) {
                    this.socket.connect()
                }
                return
            }
        }

        console.log(`Attempting connection to: ${url}`)

        this.currentUrl = url
        this.currentAuthToken = authToken
        this.triedAdbReverseFallback = false
        const isRemoteHttps = /^https:\/\//i.test(url)
        const isLikelyTunnel = /ngrok-free\.dev|ngrok\.io|trycloudflare\.com/i.test(url)
        const transports = (isRemoteHttps || isLikelyTunnel)
            ? undefined // allow polling fallback (some mobile networks block websockets)
            : ['websocket'] // local dev: avoid polling issues on Android/adb reverse

        this.socket = io(url, {
            auth: { token: authToken },
            reconnection: true,
            reconnectionAttempts: Infinity, // Keep trying
            reconnectionDelay: 1000,      // Start with 1s delay
            reconnectionDelayMax: 5000,   // Max 5s delay
            randomizationFactor: 0.5,     // Jitter to prevent thundering herd
            timeout: 10000,
            // For remote/tunnel URLs, allow polling fallback; for local dev keep websocket-only.
            transports,
        })

        this.setupListeners()
    }

    public getCurrentUrl(): string | null {
        return this.currentUrl
    }

    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect()
            this.socket = null
            this.currentUrl = null
            this.currentAuthToken = null
            this.triedAdbReverseFallback = false
        }
    }

    private setupListeners(): void {
        if (!this.socket) return

        this.socket.on('connect', () => {
            console.log('Socket Connected:', this.socket?.id)
        })

        this.socket.on('disconnect', (reason) => {
            console.log('Socket Disconnected:', reason)
        })

        this.socket.on('connect_error', (err) => {
            console.error('Socket Connection Error:', err.message);
            // Common React Native errors:
            // "websocket error" -> URL is wrong (use 10.0.2.2 for Android Emulator) OR Backend not running
            // "xhr poll error" -> Transports issue (we forced websocket)

            if (Platform.OS === 'android' && this.currentUrl?.includes('127.0.0.1')) {
                console.warn('Tip: make sure backend is running: `npm run server`.')
                console.warn('Tip (Android): run `npm run adb:reverse:all` so 127.0.0.1:3000 forwards to your PC.')
            }

            // Real devices on restricted Wi‑Fi often can't reach your laptop IP.
            // If `adb reverse tcp:3000 tcp:3000` is enabled, `127.0.0.1:3000` will work on-device.
            if (
                Platform.OS === 'android' &&
                !this.triedAdbReverseFallback &&
                this.currentUrl &&
                this.currentAuthToken &&
                !this.currentUrl.includes('127.0.0.1')
            ) {
                this.triedAdbReverseFallback = true

                const localUrl = (() => {
                    try {
                        const parsed = new URL(this.currentUrl)
                        parsed.hostname = '127.0.0.1'
                        return parsed.toString().replace(/\/$/, '')
                    } catch {
                        return 'http://127.0.0.1:3000'
                    }
                })()

                console.warn('Retrying via ADB reverse URL:', localUrl)
                this.disconnect()
                this.connect(localUrl, this.currentAuthToken)
            }
        })

        // Forward events to internal listeners
        this.socket.onAny((event, ...args) => {
            const callbacks = this.listeners.get(event)
            if (callbacks) {
                callbacks.forEach(callback => callback(...args))
            }
        })
    }

    // --- Emitters ---

    public isConnected(): boolean {
        return !!this.socket?.connected
    }

    public isInitialized(): boolean {
        return !!this.socket
    }

    public ensureConnected(timeoutMs = 5000): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('Socket not initialized'))
                return
            }
            if (this.socket.connected) {
                resolve()
                return
            }

            const timer = setTimeout(() => {
                cleanup()
                reject(new Error('Socket connect timed out'))
            }, timeoutMs)

            const cleanup = () => {
                clearTimeout(timer)
                this.socket?.off('connect', onConnect)
                this.socket?.off('connect_error', onError)
            }

            const onConnect = () => {
                cleanup()
                resolve()
            }

            const onError = (err: any) => {
                cleanup()
                reject(err instanceof Error ? err : new Error(String(err?.message ?? err)))
            }

            this.socket.on('connect', onConnect)
            this.socket.on('connect_error', onError)
            this.socket.connect()
        })
    }

    public emitMessage(event: string, data: any): void {
        if (this.socket?.connected) {
            this.socket.emit(event, data)
        } else {
            console.warn('Socket not connected. Message queued or dropped.')
            // Queueing logic can be added here if not using WatermelonDB for offline queue
        }
    }

    // Emits even if not connected yet (socket.io-client will buffer until connected).
    public emitBuffered(event: string, data: any): void {
        if (!this.socket) {
            console.warn('Socket not initialized. Emit dropped:', event)
            return
        }
        this.socket.emit(event, data)
    }

    public emitWithAck<TAck = any>(event: string, data: any, timeoutMs = 5000): Promise<TAck> {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.socket.connected) {
                reject(new Error('Socket not connected'))
                return
            }

            this.socket
                .timeout(timeoutMs)
                .emit(event, data, (err: any, ack: TAck) => {
                    if (err) {
                        reject(err)
                        return
                    }
                    resolve(ack)
                })
        })
    }

    public waitForEvent<TPayload = any>(
        event: string,
        predicate: (payload: TPayload) => boolean = () => true,
        timeoutMs = 5000
    ): Promise<TPayload> {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.socket.connected) {
                reject(new Error('Socket not connected'))
                return
            }

            let settled = false
            const unsubscribe = this.on(event, (payload: TPayload) => {
                if (settled) return
                if (!predicate(payload)) return

                settled = true
                clearTimeout(timer)
                unsubscribe()
                resolve(payload)
            })

            const timer = setTimeout(() => {
                if (settled) return
                settled = true
                unsubscribe()
                reject(new Error('Timeout'))
            }, timeoutMs)
        })
    }

    // --- Event Handling ---

    // Custom subscription method to avoid direct socket access and ensure cleanup
    public on(event: string, callback: Function): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, [])
        }

        this.listeners.get(event)?.push(callback)

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event)
            if (callbacks) {
                this.listeners.set(event, callbacks.filter(cb => cb !== callback))
            }
        }
    }
}

export const socketService = SocketService.getInstance()
