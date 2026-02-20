import { NativeModules, Platform } from 'react-native';

const getDevHostFromMetro = (): string | null => {
    const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
    if (!scriptURL) return null;

    // Examples:
    // - http://192.168.1.10:8081/index.bundle?...
    // - http://10.0.2.2:8081/index.bundle?...
    // - exp://192.168.1.10:8081 (Expo)
    // - exps://192.168.1.10:8081 (Expo)
    // - exp://192.168.1.10:8081 (Expo) -> not always present here, but safe
    const match = scriptURL.match(/^(?:https?:\/\/|exp:\/\/|exps:\/\/)([^/:?#]+)(?::\d+)?(?:\/|$)/i);
    if (!match) return null

    return match[1] ?? null
};

// Default behavior (dev/testing):
// - Prefer Metro host when available (works on real devices + emulator without manual config)
// - Fallback to 127.0.0.1 (useful for adb reverse setups or local-only testing)
const DEFAULT_HOST = getDevHostFromMetro() ?? '127.0.0.1'

export const CONFIG = {
    // Expo: set `EXPO_PUBLIC_SOCKET_URL` to override (recommended for real devices).
    // Example (Windows PowerShell): $env:EXPO_PUBLIC_SOCKET_URL="http://192.168.1.10:3000"
    SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL ?? `http://${DEFAULT_HOST}:3000`,

    // If using auth
    AUTH_TOKEN: 'dummy-token',
};
