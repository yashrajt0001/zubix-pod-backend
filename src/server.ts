import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import setupSocketIO from './socket.js';

// Import routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import podsRoutes from './routes/pods.js';
import postsRoutes from './routes/posts.js';
import reactionsRoutes from './routes/reactions.js';
import roomsRoutes from './routes/rooms.js';
import eventsRoutes from './routes/events.js';
import pitchesRoutes from './routes/pitches.js';
import chatsRoutes from './routes/chats.js';
import messageRequestsRoutes from './routes/messageRequests.js';
import callBookingsRoutes from './routes/callBookings.js';
import notificationsRoutes from './routes/notifications.js';
import uploadRoutes from './routes/upload.js';

const app: Express = express();
const server: http.Server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketIO(server);

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000",
      "https://zoobalo.com",
      "https://www.zoobalo.com",
      "https://podapi.zoobalo.com",
    ];

    // Allow no-origin (Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'zubix-pod-backend'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/pods', podsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/reactions', reactionsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/pitches', pitchesRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/message-requests', messageRequestsRoutes);
app.use('/api/call-bookings', callBookingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/upload', uploadRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
interface ErrorWithStatus extends Error {
  status?: number;
}

app.use((err: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT: number = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 Zubix Pod Server Started                        ║
║                                                       ║
║   📡 HTTP Server: http://localhost:${PORT}             ║
║   🔌 WebSocket Server: ws://localhost:${PORT}          ║
║   🌍 Environment: ${process.env.NODE_ENV || 'development'}                   ║
║   📅 Started at: ${new Date().toLocaleString()}      ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export { app, server, io };
