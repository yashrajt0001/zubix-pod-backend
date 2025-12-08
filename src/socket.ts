import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from './utils/jwt.js';
import prisma from './utils/prisma.js';

interface SocketUser {
  id: string;
  username: string;
  role: string;
  fullName: string | null;
  avatar: string | null;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
  currentRoom?: string;
}

const setupSocketIO = (server: HttpServer): Server => {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://zoobalo.com',
    'https://www.zoobalo.com',
    'https://podapi.zoobalo.com',
    'https://zubix-pod.vercel.app'
  ];

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow no-origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS: ' + origin), false);
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  });

  // Middleware for authentication
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error('Authentication error: Invalid token'));
      }

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, role: true, fullName: true, avatar: true }
      });

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.user?.username} (${socket.user?.id})`);

    // Join a room
    socket.on('join-room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data;

        // Verify room exists
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            pod: {
              select: {
                id: true,
                ownerId: true
              }
            }
          }
        });

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is a member or owner of the pod
        const isMember = await prisma.podMember.findUnique({
          where: {
            podId_userId: {
              podId: room.pod.id,
              userId: socket.user!.id
            }
          }
        });

        const isOwner = room.pod.ownerId === socket.user!.id;

        if (!isMember && !isOwner) {
          socket.emit('error', { message: 'You must be a member of this pod to join this room' });
          return;
        }

        // Join the socket room
        socket.join(roomId);
        socket.currentRoom = roomId;

        console.log(`${socket.user!.username} joined room: ${roomId}`);

        // Notify others in the room
        socket.to(roomId).emit('user-joined', {
          user: {
            id: socket.user!.id,
            username: socket.user!.username,
            fullName: socket.user!.fullName,
            avatar: socket.user!.avatar
          },
          timestamp: new Date()
        });

        // Send confirmation to the user
        socket.emit('room-joined', {
          roomId,
          message: 'Successfully joined room'
        });
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave a room
    socket.on('leave-room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data;

        if (socket.currentRoom === roomId) {
          socket.leave(roomId);
          socket.currentRoom = undefined;

          console.log(`${socket.user!.username} left room: ${roomId}`);

          // Notify others in the room
          socket.to(roomId).emit('user-left', {
            user: {
              id: socket.user!.id,
              username: socket.user!.username
            },
            timestamp: new Date()
          });

          socket.emit('room-left', {
            roomId,
            message: 'Successfully left room'
          });
        }
      } catch (error) {
        console.error('Leave room error:', error);
        socket.emit('error', { message: 'Failed to leave room' });
      }
    });

    // Send a message
    socket.on('send-message', async (data: { roomId: string; content: string }) => {
      try {
        const { roomId, content } = data;

        if (!content || !content.trim()) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        // Verify room exists
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            pod: {
              select: {
                id: true,
                ownerId: true
              }
            }
          }
        });

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is a member or owner of the pod
        const isMember = await prisma.podMember.findUnique({
          where: {
            podId_userId: {
              podId: room.pod.id,
              userId: socket.user!.id
            }
          }
        });

        const isOwner = room.pod.ownerId === socket.user!.id;

        if (!isMember && !isOwner) {
          socket.emit('error', { message: 'You must be a member of this pod to send messages' });
          return;
        }

        // Save message to database
        const message = await prisma.message.create({
          data: {
            content: content.trim(),
            roomId,
            senderId: socket.user!.id
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                mobile: true,
                role: true,
                profilePhoto: true,
                createdAt: true
              }
            }
          }
        });

        console.log(`Message from ${socket.user!.username} in room ${roomId}`);

        // Broadcast message to all users in the room (including sender)
        io.to(roomId).emit('new-message', message);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing-start', (data: { roomId: string }) => {
      try {
        const { roomId } = data;
        
        if (socket.currentRoom === roomId) {
          socket.to(roomId).emit('user-typing', {
            user: {
              id: socket.user!.id,
              username: socket.user!.username
            },
            roomId
          });
        }
      } catch (error) {
        console.error('Typing start error:', error);
      }
    });

    socket.on('typing-stop', (data: { roomId: string }) => {
      try {
        const { roomId } = data;
        
        if (socket.currentRoom === roomId) {
          socket.to(roomId).emit('user-stopped-typing', {
            user: {
              id: socket.user!.id,
              username: socket.user!.username
            },
            roomId
          });
        }
      } catch (error) {
        console.error('Typing stop error:', error);
      }
    });

    // Join a chat (DM)
    socket.on('join-chat', async (data: { chatId: string }) => {
      try {
        const { chatId } = data;

        // Verify user is a participant
        const participant = await prisma.chatParticipant.findUnique({
          where: {
            chatId_userId: {
              chatId,
              userId: socket.user!.id
            }
          }
        });

        if (!participant) {
          socket.emit('error', { message: 'You are not a participant of this chat' });
          return;
        }

        socket.join(`chat:${chatId}`);
        console.log(`${socket.user!.username} joined chat: ${chatId}`);

        socket.emit('chat-joined', {
          chatId,
          message: 'Successfully joined chat'
        });
      } catch (error) {
        console.error('Join chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Leave a chat
    socket.on('leave-chat', (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        socket.leave(`chat:${chatId}`);
        console.log(`${socket.user!.username} left chat: ${chatId}`);
      } catch (error) {
        console.error('Leave chat error:', error);
      }
    });

    // Send direct message
    socket.on('send-dm', async (data: { chatId: string; content: string }) => {
      try {
        const { chatId, content } = data;

        if (!content || !content.trim()) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        // Verify user is a participant
        const participant = await prisma.chatParticipant.findUnique({
          where: {
            chatId_userId: {
              chatId,
              userId: socket.user!.id
            }
          }
        });

        if (!participant) {
          socket.emit('error', { message: 'You are not a participant of this chat' });
          return;
        }

        // Save message to database
        const message = await prisma.message.create({
          data: {
            content: content.trim(),
            chatId,
            senderId: socket.user!.id
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true
              }
            }
          }
        });

        // Update chat's updatedAt
        await prisma.chat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() }
        });

        console.log(`DM from ${socket.user!.username} in chat ${chatId}`);

        // Broadcast message to all users in the chat
        io.to(`chat:${chatId}`).emit('new-dm', message);
      } catch (error) {
        console.error('Send DM error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // DM typing indicator
    socket.on('dm-typing-start', (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        socket.to(`chat:${chatId}`).emit('dm-user-typing', {
          user: {
            id: socket.user!.id,
            username: socket.user!.username
          },
          chatId
        });
      } catch (error) {
        console.error('DM typing start error:', error);
      }
    });

    socket.on('dm-typing-stop', (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        socket.to(`chat:${chatId}`).emit('dm-user-stopped-typing', {
          user: {
            id: socket.user!.id,
            username: socket.user!.username
          },
          chatId
        });
      } catch (error) {
        console.error('DM typing stop error:', error);
      }
    });

    // Join user's personal notification channel
    socket.on('join-notifications', () => {
      try {
        const userId = socket.user!.id;
        socket.join(`user:${userId}`);
        console.log(`${socket.user!.username} joined notifications channel`);
        
        socket.emit('notifications-joined', {
          message: 'Successfully joined notifications'
        });
      } catch (error) {
        console.error('Join notifications error:', error);
      }
    });

    // Auto-join user's notification channel on connection
    socket.join(`user:${socket.user!.id}`);

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user?.username} (${socket.user?.id})`);

      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('user-left', {
          user: {
            id: socket.user!.id,
            username: socket.user!.username
          },
          timestamp: new Date()
        });
      }
    });
  });

  return io;
};

// Export io instance for use in other modules (e.g., to send notifications)
export let ioInstance: Server | null = null;

const setupSocketIOWithExport = (server: HttpServer): Server => {
  const io = setupSocketIO(server);
  ioInstance = io;
  return io;
};

export { setupSocketIOWithExport };
export default setupSocketIO;
