import { io } from "socket.io-client";
import { getSocketBase } from "./config";

let socket = null;
let socketBase = null;

export function getSocket() {
  const base = getSocketBase();
  if (!socket || socketBase !== base) {
    if (socket) socket.disconnect();
    socketBase = base;
    socket = io(base || undefined, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1000,
      path: "/socket.io",
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketBase = null;
  }
}
