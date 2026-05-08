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
}
