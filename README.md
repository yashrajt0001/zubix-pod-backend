# Zubix Pod - Social Media Backend

A comprehensive social media backend platform with pods, rooms, events, and real-time chat functionality built with Node.js, Express, Prisma, PostgreSQL, and Socket.IO.

## 🚀 Features

### User Management
- **Dual User Roles**: Users can register as regular users or pod owners
- **JWT Authentication**: Secure token-based authentication
- **User Profiles**: Customizable profiles with avatars and bios

### Pod System
- **Pod Creation**: Pod owners can create and manage their own pods
- **Pod Discovery**: Users can search for pods by name
- **Pod Membership**: Users can join/leave pods freely
- **Member Management**: Pod owners can remove members

### Posts & Updates
- **Owner Updates**: Posts created by pod owners
- **Member Updates**: Posts created by pod members
- **All Updates**: Combined feed showing all posts
- **Post Filtering**: View posts by specific pod or all joined pods
- **Post Management**: Pod owners can delete any post in their pods
- **Media Support**: Image attachments for posts

### Reactions
- **5 Reaction Types**: Like, Love, Wow, Sad, Angry
- **Real-time Updates**: Instant reaction updates
- **Reaction Summary**: Grouped reactions by type

### Rooms & Chat
- **Pod Rooms**: Pod owners create chat rooms within pods
- **Real-time Messaging**: Socket.IO powered chat
- **Room Management**: Create, update, delete rooms
- **Typing Indicators**: See when users are typing
- **Message History**: Paginated message retrieval
- **User Presence**: Join/leave notifications

### Events
- **Event Creation**: Pod owners can create events
- **Event Details**: Title, description, location, dates, images
- **Event Participation**: Users can join/leave events
- **Event Feed**: View all events from joined pods
- **Participant List**: See who's attending

## 📋 Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd zubix-pod
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL="postgresql://username:password@localhost:5432/zubix_pod?schema=public"
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   CLIENT_URL=http://localhost:5173
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. **Start the server**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## 📚 API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username",
  "password": "password123",
  "role": "USER", // or "POD_OWNER"
  "fullName": "Full Name"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Pods

#### Search Pods
```http
GET /api/pods/search?query=tech
Authorization: Bearer <token>
```

#### Get All Public Pods
```http
GET /api/pods
Authorization: Bearer <token>
```

#### Get Joined Pods
```http
GET /api/pods/joined
Authorization: Bearer <token>
```

#### Get Owned Pods (Pod Owner Only)
```http
GET /api/pods/owned
Authorization: Bearer <token>
```

#### Create Pod (Pod Owner Only)
```http
POST /api/pods
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Tech Enthusiasts",
  "description": "A community for tech lovers",
  "isPublic": true
}
```

#### Join Pod
```http
POST /api/pods/:podId/join
Authorization: Bearer <token>
```

#### Leave Pod
```http
POST /api/pods/:podId/leave
Authorization: Bearer <token>
```

### Posts

#### Get Posts from Specific Pod
```http
GET /api/posts/pod/:podId?type=all
Authorization: Bearer <token>
# type can be: owner, member, or all
```

#### Get Feed from All Joined Pods
```http
GET /api/posts/feed?type=all
Authorization: Bearer <token>
```

#### Create Post
```http
POST /api/posts
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello, world!",
  "podId": "pod-uuid",
  "imageUrl": "https://example.com/image.jpg"
}
```

#### Delete Post
```http
DELETE /api/posts/:postId
Authorization: Bearer <token>
```

### Reactions

#### Add Reaction
```http
POST /api/reactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "postId": "post-uuid",
  "type": "like" // like, love, wow, sad, angry
}
```

#### Remove Reaction
```http
DELETE /api/reactions/:postId
Authorization: Bearer <token>
```

### Rooms

#### Get Rooms in Pod
```http
GET /api/rooms/pod/:podId
Authorization: Bearer <token>
```

#### Create Room (Pod Owner Only)
```http
POST /api/rooms
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "General Chat",
  "description": "Main discussion room",
  "podId": "pod-uuid"
}
```

#### Get Room Messages
```http
GET /api/rooms/:roomId/messages?limit=50&before=message-uuid
Authorization: Bearer <token>
```

### Events

#### Get Events Feed
```http
GET /api/events/feed
Authorization: Bearer <token>
```

#### Get Pod Events
```http
GET /api/events/pod/:podId
Authorization: Bearer <token>
```

#### Create Event (Pod Owner Only)
```http
POST /api/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Tech Meetup",
  "description": "Monthly tech discussion",
  "location": "Virtual",
  "startDate": "2025-12-15T18:00:00Z",
  "endDate": "2025-12-15T20:00:00Z",
  "podId": "pod-uuid"
}
```

#### Join Event
```http
POST /api/events/:eventId/join
Authorization: Bearer <token>
```

## 🔌 WebSocket Events

### Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Room Events

#### Join Room
```javascript
socket.emit('join-room', { roomId: 'room-uuid' });

socket.on('room-joined', (data) => {
  console.log('Joined room:', data);
});

socket.on('user-joined', (data) => {
  console.log('User joined:', data.user);
});
```

#### Send Message
```javascript
socket.emit('send-message', {
  roomId: 'room-uuid',
  content: 'Hello everyone!'
});

socket.on('new-message', (message) => {
  console.log('New message:', message);
});
```

#### Typing Indicators
```javascript
// Start typing
socket.emit('typing-start', { roomId: 'room-uuid' });

// Stop typing
socket.emit('typing-stop', { roomId: 'room-uuid' });

// Listen for typing
socket.on('user-typing', (data) => {
  console.log(`${data.user.username} is typing...`);
});

socket.on('user-stopped-typing', (data) => {
  console.log(`${data.user.username} stopped typing`);
});
```

#### Leave Room
```javascript
socket.emit('leave-room', { roomId: 'room-uuid' });

socket.on('room-left', (data) => {
  console.log('Left room:', data);
});

socket.on('user-left', (data) => {
  console.log('User left:', data.user);
});
```

## 🏗️ Project Structure

```
zubix-pod/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── middleware/
│   │   └── auth.js           # Authentication middleware
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── pods.js           # Pod management routes
│   │   ├── posts.js          # Post routes
│   │   ├── reactions.js      # Reaction routes
│   │   ├── rooms.js          # Room management routes
│   │   └── events.js         # Event routes
│   ├── utils/
│   │   ├── jwt.js            # JWT utilities
│   │   └── password.js       # Password hashing utilities
│   ├── socket.js             # Socket.IO setup and handlers
│   └── server.js             # Main server file
├── .env.example              # Environment variables template
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## 🗃️ Database Schema

The application uses the following main entities:

- **User**: User accounts with roles (USER or POD_OWNER)
- **Pod**: Communities created by pod owners
- **PodMember**: Junction table for pod memberships
- **Post**: Updates created by users (OWNER_UPDATE or MEMBER_UPDATE)
- **Reaction**: Reactions to posts (like, love, wow, sad, angry)
- **Room**: Chat rooms within pods
- **Message**: Chat messages in rooms
- **Event**: Events created by pod owners
- **EventParticipant**: Junction table for event participation

## 🔐 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Pod membership verification
- Socket.IO authentication middleware
- Input validation with express-validator

## 🧪 Development

### View Database
```bash
npm run prisma:studio
```

### Create Migration
```bash
npm run prisma:migrate
```

### Generate Prisma Client
```bash
npm run prisma:generate
```

## 📦 Deployment

1. Set `NODE_ENV=production` in your environment
2. Update `DATABASE_URL` with production database
3. Set a strong `JWT_SECRET`
4. Configure `CLIENT_URL` for CORS
5. Run migrations: `npx prisma migrate deploy`
6. Start server: `npm start`

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## 📄 License

ISC

## 👥 Support

For support, email support@zubix.com or open an issue in the repository.

---

Built with ❤️ using Node.js, Express, Prisma, PostgreSQL, and Socket.IO
#   z u b i x - p o d - b a c k e n d  
 