interface SocketLike {
  readonly readyState: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

interface RoomConnection {
  readonly memberId: string;
  readonly socket: SocketLike;
}

const OPEN_STATE = 1;

export class RoomHub {
  private readonly sockets = new Map<string, Set<RoomConnection>>();

  public add(roomId: string, memberId: string, socket: SocketLike): () => void {
    const roomSockets = this.sockets.get(roomId) ?? new Set<RoomConnection>();
    const connection = { memberId, socket };
    roomSockets.add(connection);
    this.sockets.set(roomId, roomSockets);

    return () => {
      roomSockets.delete(connection);
      if (roomSockets.size === 0) this.sockets.delete(roomId);
    };
  }

  public broadcast(roomId: string, payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const connection of this.sockets.get(roomId) ?? []) {
      if (connection.socket.readyState === OPEN_STATE)
        connection.socket.send(serialized);
    }
  }

  public closeMember(
    roomId: string,
    memberId: string,
    code: number,
    reason: string,
  ): void {
    for (const connection of this.sockets.get(roomId) ?? []) {
      if (connection.memberId === memberId)
        connection.socket.close(code, reason);
    }
  }

  public closeRoom(roomId: string, code: number, reason: string): void {
    for (const connection of this.sockets.get(roomId) ?? []) {
      connection.socket.close(code, reason);
    }
  }
}
