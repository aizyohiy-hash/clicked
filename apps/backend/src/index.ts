import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { socketAuthMiddleware, type AuthSocket } from './middleware/socketAuth.js';
import { registerMessagingHandlers } from './socket/messaging.js';
import { app } from './app.js';
import {
  buildRpcFetcher,
  runForever as runStellarListener,
} from './services/stellarListener.js';

dotenv.config();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.use(socketAuthMiddleware);

io.on('connection', (socket: AuthSocket) => {
  console.log('User connected:', socket.auth?.userId, socket.id);
  registerMessagingHandlers(io, socket);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.auth?.userId);
  });
});

/**
 * Issue #7 — Redis pub/sub adapter for horizontal Socket.IO scaling.
 *
 * When `REDIS_URL` is reachable, attach `@socket.io/redis-adapter` so
 * multiple backend instances share rooms via Redis pub/sub. If the
 * connection fails (Redis down, wrong URL, or env var unset), log a
 * warning and continue running in single-instance mode — the in-process
 * adapter remains active so the server still works locally.
 */
async function attachRedisAdapter(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => {
    console.warn('[socket.io] Redis pub client error — degrading to local adapter:', err.message);
  });
  subClient.on('error', (err) => {
    console.warn('[socket.io] Redis sub client error — degrading to local adapter:', err.message);
  });

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[socket.io] Redis adapter attached (${redisUrl})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[socket.io] Redis unavailable (${message}) — running in single-instance mode`);
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  }
}

const PORT = process.env['PORT'] ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

// Attach the Redis adapter after listen() so the API is reachable even if
// Redis is unreachable; on failure we fall back to the in-process adapter.
void attachRedisAdapter();

// #46 — Stellar transfer event listener. Only spin up when the contract
// id is configured so local-dev and unit-test runs don't try to talk to
// Soroban RPC. The listener never throws out of runForever, so a failed
// chain connection logs but doesn't crash the API.
const stellarRpcUrl = process.env['STELLAR_RPC_URL'];
const tokenTransferContractId = process.env['TOKEN_TRANSFER_CONTRACT_ID'];
if (stellarRpcUrl && tokenTransferContractId) {
  void runStellarListener({
    fetchEvents: buildRpcFetcher({
      rpcUrl: stellarRpcUrl,
      contractId: tokenTransferContractId,
    }),
  });
} else {
  console.log(
    '[stellar-listener] STELLAR_RPC_URL or TOKEN_TRANSFER_CONTRACT_ID unset; listener disabled.',
  );
}
