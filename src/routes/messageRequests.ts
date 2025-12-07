import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { ApiResponse } from '../utils/responses';
import { userSelectMinimal } from '../utils/permissions';

const router = express.Router();

// Get received message requests
router.get('/received', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const requests = await prisma.messageRequest.findMany({
      where: {
        receiverId: userId
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePhoto: true,
            email: true,
            mobile: true,
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ requests });
  } catch (error) {
    console.error('Get received requests error:', error);
    res.status(500).json({ error: 'Failed to fetch received requests' });
  }
});

// Get sent message requests
router.get('/sent', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const requests = await prisma.messageRequest.findMany({
      where: {
        senderId: userId
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePhoto: true,
            email: true,
            mobile: true,
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ requests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// Get pending count
router.get('/pending/count', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const count = await prisma.messageRequest.count({
      where: {
        receiverId: userId,
        status: 'PENDING'
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Get pending count error:', error);
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// Send a message request
router.post('/',
  authMiddleware,
  [
    body('receiverId').notEmpty().withMessage('Receiver ID is required'),
    body('initialMessage').notEmpty().withMessage('Initial message is required')
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { receiverId, initialMessage } = req.body;
      const senderId = req.user!.id;

      if (receiverId === senderId) {
        res.status(400).json({ error: 'Cannot send message request to yourself' });
        return;
      }

      // Check if receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId }
      });

      if (!receiver) {
        res.status(404).json({ error: 'Receiver not found' });
        return;
      }

      // Check if request already exists
      const existingRequest = await prisma.messageRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId,
            receiverId
          }
        }
      });

      if (existingRequest) {
        res.status(400).json({ error: 'Message request already sent' });
        return;
      }

      // Check if chat already exists between these users
      const existingChats = await prisma.chat.findMany({
        where: {
          participants: {
            every: {
              userId: {
                in: [senderId, receiverId]
              }
            }
          }
        },
        include: {
          participants: true
        }
      });

      const existingChat = existingChats.find(chat => 
        chat.participants.length === 2 &&
        chat.participants.some(p => p.userId === senderId) &&
        chat.participants.some(p => p.userId === receiverId)
      );

      if (existingChat) {
        res.status(400).json({ error: 'Chat already exists with this user' });
        return;
      }

      const request = await prisma.messageRequest.create({
        data: {
          senderId,
          receiverId,
          initialMessage
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profilePhoto: true,
              email: true,
              mobile: true,
              role: true,
              createdAt: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profilePhoto: true,
              email: true,
              mobile: true,
              role: true,
              createdAt: true
            }
          }
        }
      });

      res.status(201).json({ request });
    } catch (error) {
      console.error('Send message request error:', error);
      res.status(500).json({ error: 'Failed to send message request' });
    }
  }
);

// Accept a message request
router.post('/:requestId/accept', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      res.status(404).json({ error: 'Message request not found' });
      return;
    }

    if (request.receiverId !== userId) {
      res.status(403).json({ error: 'You can only accept requests sent to you' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Request has already been processed' });
      return;
    }

    // Update request status
    const updatedRequest = await prisma.messageRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date()
      }
    });

    // Create chat between sender and receiver
    const chat = await prisma.chat.create({
      data: {
        participants: {
          create: [
            { userId: request.senderId },
            { userId: request.receiverId }
          ]
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    // Create initial message in the chat
    await prisma.message.create({
      data: {
        content: request.initialMessage,
        chatId: chat.id,
        senderId: request.senderId
      }
    });

    res.json({ request: updatedRequest, chatId: chat.id });
  } catch (error) {
    console.error('Accept message request error:', error);
    res.status(500).json({ error: 'Failed to accept message request' });
  }
});

// Reject a message request
router.post('/:requestId/reject', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user!.id;

    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      res.status(404).json({ error: 'Message request not found' });
      return;
    }

    if (request.receiverId !== userId) {
      res.status(403).json({ error: 'You can only reject requests sent to you' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Request has already been processed' });
      return;
    }

    const updatedRequest = await prisma.messageRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        respondedAt: new Date()
      }
    });

    res.json({ request: updatedRequest });
  } catch (error) {
    console.error('Reject message request error:', error);
    res.status(500).json({ error: 'Failed to reject message request' });
  }
});

// Check if request exists between two users
router.get('/check/:targetUserId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetUserId } = req.params;
    const userId = req.user!.id;

    const request = await prisma.messageRequest.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: userId }
        ]
      }
    });

    res.json({ request: request || null });
  } catch (error) {
    console.error('Check request error:', error);
    res.status(500).json({ error: 'Failed to check request' });
  }
});

export default router;
