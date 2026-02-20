import io from 'socket.io-client';

const TEST_URLS = [
    'http://localhost:3000',
    'http://10.0.2.2:3000', // Android Emulator
    'http://192.168.1.x:3000', // Replace with your LAN IP
    'https://echo.websocket.org' // Public echo server (if available)
];

const testConnection = (url: string) => {
    console.log(`Testing connection to: ${url}`);
    const socket = io(url, {
        transports: ['websocket'],
        reconnectionAttempts: 1,
        timeout: 5000,
    });

    socket.on('connect', () => {
        console.log(`✅ SUCCESS: Connected to ${url} (ID: ${socket.id})`);
        socket.disconnect();
    });

    socket.on('connect_error', (err) => {
        console.log(`❌ FAILURE: Could not connect to ${url}. Error: ${err.message}`);
        // Detailed error often requires looking at the network tab or native logs
    });
};

TEST_URLS.forEach(url => testConnection(url));
