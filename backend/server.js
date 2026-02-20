const { Server } = require("socket.io");
const http = require("http");

const httpServer = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            features: { users: true, rooms: true },
            usersCount: users.size,
            uptimeSec: Math.round(process.uptime()),
        }));
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
});
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for development
    },
});

const PORT = Number(process.env.PORT) || 3000;

const normalizeMobile = (mobile) => String(mobile ?? "").replace(/[^\d+]/g, "").trim();
const users = new Map(); // key: mobile, value: { id, name, mobile, createdAt, updatedAt }

// --- Chat Message Store (in-memory, per conversation) ---
// NOTE: This is a demo server store (resets on server restart).
// It supports:
// - Idempotent sends (client tempId is used as a de-dupe key per conversation)
// - Paging older messages
// - Delivered/read status updates
const MAX_MESSAGES_PER_CONVERSATION = 10000;
const messagesByConversation = new Map(); // conversationId -> Array<Message>
const clientIndexByConversation = new Map(); // conversationId -> Map<tempId, Message>

const getConversationStore = (conversationId) => {
    if (!messagesByConversation.has(conversationId)) messagesByConversation.set(conversationId, []);
    if (!clientIndexByConversation.has(conversationId)) clientIndexByConversation.set(conversationId, new Map());
    return {
        messages: messagesByConversation.get(conversationId),
        byClientId: clientIndexByConversation.get(conversationId),
    };
};

const getRoomSize = (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
};

io.on("connection", (socket) => {
    console.log(`User Connected ----->: ${socket.id}`);

    socket.on("user:list", (_data, callback) => {
        console.log("user:list from", socket.id);
        if (typeof callback !== "function") return;
        callback({ ok: true, users: Array.from(users.values()) });
    });

    socket.on("user:upsert", (data, callback) => {
        console.log("user:upsert from ---->", socket.id, data);
        const name = String(data?.name ?? "").trim();
        const mobile = normalizeMobile(data?.mobile);

        if (!name || !mobile) {
            if (typeof callback === "function") callback({ ok: false, error: "name_and_mobile_required" });
            return;
        }

        const now = Date.now();
        const existing = users.get(mobile);
        const user = existing
            ? { ...existing, name, updatedAt: now }
            : { id: mobile, name, mobile, createdAt: now, updatedAt: now };

        users.set(mobile, user);

        if (typeof callback === "function") callback({ ok: true, user });
        io.emit("user:upserted", { user });
    });

    socket.on("conversation:join", (data, callback) => {
        const conversationId = data?.conversationId;
        if (!conversationId || typeof conversationId !== "string") {
            console.warn("conversation:join missing conversationId");
            if (typeof callback === "function") callback({ ok: false });
            return;
        }

        socket.join(conversationId);
        console.log(`Socket ${socket.id} joined room: ${conversationId}`);
        if (typeof callback === "function") callback({ ok: true, conversationId });
    });

    socket.on("conversation:leave", (data, callback) => {
        const conversationId = data?.conversationId;
        if (!conversationId || typeof conversationId !== "string") {
            if (typeof callback === "function") callback({ ok: false });
            return;
        }

        socket.leave(conversationId);
        console.log(`Socket ${socket.id} left room: ${conversationId}`);
        if (typeof callback === "function") callback({ ok: true, conversationId });
    });

    // Handle 'message:send' event from React Native
    socket.on("message:send", (data, callback) => {
        console.log("Received data:", data);
        console.log("Has ack callback ----->:", typeof callback === "function");

        const conversationId = data?.conversationId;
        const userId = data?.userId;
        const body = String(data?.body ?? "");
        const type = data?.type ?? "text";
        const tempId = String(data?.id ?? "");

        if (!conversationId || typeof conversationId !== "string") {
            if (typeof callback === "function") callback({ ok: false, error: "conversation_id_required" });
            return;
        }
        if (!userId || typeof userId !== "string") {
            if (typeof callback === "function") callback({ ok: false, error: "user_id_required" });
            return;
        }
        if (!tempId) {
            if (typeof callback === "function") callback({ ok: false, error: "temp_id_required" });
            return;
        }
        if (!body.trim()) {
            if (typeof callback === "function") callback({ ok: false, error: "body_required" });
            return;
        }

        const { messages, byClientId } = getConversationStore(conversationId);

        // Idempotency: if client retries the same tempId, return the same serverId.
        const existing = byClientId.get(tempId);
        if (existing) {
            const ackPayload = { tempId, serverId: existing.id, timestamp: existing.createdAt };
            if (typeof callback === "function") callback(ackPayload);
            socket.emit("message:sent", ackPayload);
            return;
        }

        const now = Date.now();
        const serverId = `${now}-${Math.random().toString(16).slice(2)}`;

        const outgoing = {
            id: serverId,
            tempId, // helps client reconcile optimistic temp message
            conversationId,
            userId,
            body,
            type,
            status: "sent",
            createdAt: now,
        };

        messages.push(outgoing);
        byClientId.set(tempId, outgoing);
        if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
            const overflow = messages.length - MAX_MESSAGES_PER_CONVERSATION;
            const removed = messages.splice(0, overflow);
            for (const r of removed) {
                if (r?.tempId) byClientId.delete(String(r.tempId));
            }
        }

        // 1. Send Acknowledgement (Success)
        // - ACK callback (preferred, used by client timeout/ack flow)
        // - Also emit 'message:sent' event (backwards compatible)
        const ackPayload = {
            tempId,        // The temp ID sent by client
            serverId,      // Mock server ID
            timestamp: now
        };

        // ACK immediately (important: client can timeout waiting for ACK)
        // When the client uses `socket.timeout(ms).emit(...)`, the client callback
        // becomes `(err, ...ackArgs)`, so we should send *only* the payload here.
        if (typeof callback === "function") {
            try {
                callback(ackPayload);
                console.log("Sent ACK callback:", ackPayload);
            } catch (e) {
                console.error("Ack callback threw:", e);
            }
        } else {
            console.warn("No ACK callback provided by client for message:send");
        }

        // Optional: Simulate network delay for "sent" + broadcast
        setTimeout(() => {
            socket.emit("message:sent", ackPayload);
            console.log("Sent Ack:", ackPayload);

            // 2. Send only to the conversation room (1:1 / group chat)
            // Fallback: broadcast globally if conversationId not provided.
            if (conversationId && typeof conversationId === "string") {
                socket.to(conversationId).emit("message:new", outgoing);
            } else {
                socket.broadcast.emit("message:new", outgoing);
            }

            // Delivered (best-effort): if the room has at least 2 sockets, mark delivered.
            // This is not a true per-user delivery receipt, but it's good enough for demo.
            if (conversationId && typeof conversationId === "string" && getRoomSize(conversationId) > 1) {
                outgoing.status = "delivered";
                socket.emit("message:status", { id: outgoing.id, status: "delivered", tempId });
            }
        }, 150);
    });

    // Recipient can explicitly confirm delivery for better accuracy than room-size guessing.
    socket.on("message:delivered", (data, callback) => {
        const conversationId = data?.conversationId;
        const messageId = data?.id;
        if (!conversationId || typeof conversationId !== "string" || !messageId || typeof messageId !== "string") {
            if (typeof callback === "function") callback({ ok: false });
            return;
        }

        const { messages } = getConversationStore(conversationId);
        const msg = messages.find(m => m.id === messageId);
        if (msg && msg.status !== "read" && msg.status !== "delivered") {
            msg.status = "delivered";
            io.to(conversationId).emit("message:status", { id: messageId, status: "delivered" });
        }

        if (typeof callback === "function") callback({ ok: true });
    });

    // Mark recent messages as read for this conversation
    socket.on("conversation:read", (data, callback) => {
        const conversationId = data?.conversationId;
        const readerId = data?.userId;
        if (!conversationId || typeof conversationId !== "string" || !readerId || typeof readerId !== "string") {
            if (typeof callback === "function") callback({ ok: false });
            return;
        }

        const { messages } = getConversationStore(conversationId);
        const candidates = messages.filter(m => m.userId !== readerId && m.status !== "read");
        const toMark = candidates.slice(-200); // cap to prevent huge bursts

        for (const m of toMark) {
            m.status = "read";
            io.to(conversationId).emit("message:status", { id: m.id, status: "read" });
        }

        if (typeof callback === "function") callback({ ok: true, count: toMark.length });
    });

    // Page older messages (newest-first pagination, returns oldest->newest for stable insertion)
    socket.on("message:history", (data, callback) => {
        const conversationId = data?.conversationId;
        const before = typeof data?.before === "number" ? data.before : Number.POSITIVE_INFINITY;
        const limit = Math.max(1, Math.min(200, Number(data?.limit ?? 50)));

        if (!conversationId || typeof conversationId !== "string") {
            if (typeof callback === "function") callback({ ok: false, error: "conversation_id_required" });
            return;
        }

        const { messages } = getConversationStore(conversationId);
        const older = messages
            .filter(m => typeof m?.createdAt === "number" && m.createdAt < before)
            .sort((a, b) => b.createdAt - a.createdAt);

        const pageDesc = older.slice(0, limit);
        const pageAsc = pageDesc.slice().reverse();
        const hasMore = older.length > limit;
        const nextBefore = pageAsc.length ? pageAsc[0].createdAt : null;

        if (typeof callback === "function") {
            callback({
                ok: true,
                messages: pageAsc,
                hasMore,
                nextBefore,
            });
        }
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Local Socket Server running on port ${PORT}`);
    console.log(`✅ Features: users + rooms enabled`);
    console.log(`👉 Health: http://127.0.0.1:${PORT}/health`);
    console.log(`👉 Android Emulator: http://10.0.2.2:${PORT}`);
});
