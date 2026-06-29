import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function initSocket(
  token: string,
  serverUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
): Socket {
  if (socket) return socket;

  socket = io(serverUrl, {
    auth: { token },
    reconnection: true,
  });

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  socket.on('error', (error) => console.error('Socket error:', error));

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function closeSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
