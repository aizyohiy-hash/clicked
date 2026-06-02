import type { Server } from 'socket.io';

let socketServer: Server | null = null;

export function setSocketServer(server: Server): void {
  socketServer = server;
}

export function getSocketServer(): Server | null {
  return socketServer;
}
