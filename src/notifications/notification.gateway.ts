import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { NotificationDocument } from './schemas/notification.schema';

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGIN
      : 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationGateway {
  @WebSocketServer()
  server!: Server;

  broadcast(notification: NotificationDocument) {
    this.server.emit('notification', notification);
  }

  /**
   * A notification's subject no longer exists.
   *
   * Without this, deleting a recipe only cleaned the database: every
   * client that already had the notification in memory kept rendering it
   * until a full reload, because the tray merges socket pushes on top of
   * the REST list and a push is never taken back.
   */
  broadcastRemoval(targetId: string) {
    this.server.emit('notification:removed', { targetId });
  }
}
