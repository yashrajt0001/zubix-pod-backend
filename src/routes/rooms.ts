import express, { Response } from 'express';
import { authMiddleware, isPodOwner, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { ApiResponse } from '../utils/responses';
import { checkPodMembership, checkPodOwnership, userSelectMinimal } from '../utils/permissions';

const router = express.Router();

// Get all rooms in a pod
router.get('/pod/:podId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { podId } = req.params;

    // Check if user is a member or owner of the pod
    const pod = await prisma.pod.findUnique({
      where: { id: podId },
      select: { ownerId: true }
    });

    if (!pod) {
      return res.status(404).json({ error: 'Pod not found' });
    }

    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId,
          userId: req.user!.id
        }
      }
    });

    const isOwner = pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view rooms' });
    }

    const rooms = await prisma.room.findMany({
      where: { podId },
      include: {
        pod: {
          select: {
            id: true,
            name: true,
            profilePhoto: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Get a single room by ID
router.get('/:roomId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        pod: {
          select: {
            id: true,
            name: true,
            profilePhoto: true,
            ownerId: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: room.podId,
          userId: req.user!.id
        }
      }
    });

    const isOwner = room.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view this room' });
    }

    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Create a room (pod owner only)
router.post('/',
  authMiddleware,
  isPodOwner,
  [
    body('name').isLength({ min: 3 }).withMessage('Room name must be at least 3 characters'),
    body('description').optional().isString(),
    body('podId').notEmpty().withMessage('Pod ID is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, podId } = req.body;

      // Check if user owns the pod
      const pod = await prisma.pod.findUnique({
        where: { id: podId }
      });

      if (!pod) {
        return res.status(404).json({ error: 'Pod not found' });
      }

      if (pod.ownerId !== req.user!.id) {
        return res.status(403).json({ error: 'You are not the owner of this pod' });
      }

      const room = await prisma.room.create({
        data: {
          name,
          description,
          podId
        },
        include: {
          pod: {
            select: {
              id: true,
              name: true,
              profilePhoto: true
            }
          }
        }
      });

      res.status(201).json({ room });
    } catch (error) {
      console.error('Create room error:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  }
);

// Update a room (pod owner only)
router.put('/:roomId',
  authMiddleware,
  isPodOwner,
  [
    body('name').optional().isLength({ min: 3 }),
    body('description').optional().isString()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId } = req.params;
      const { name, description } = req.body;

      // Check if room exists and user owns the pod
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          pod: {
            select: {
              ownerId: true
            }
          }
        }
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.pod.ownerId !== req.user!.id) {
        return res.status(403).json({ error: 'You are not the owner of this pod' });
      }

      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description })
        },
        include: {
          pod: {
            select: {
              id: true,
              name: true,
              profilePhoto: true
            }
          }
        }
      });

      res.json({ room: updatedRoom });
    } catch (error) {
      console.error('Update room error:', error);
      res.status(500).json({ error: 'Failed to update room' });
    }
  }
);

// Delete a room (pod owner only)
router.delete('/:roomId', authMiddleware, isPodOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;

    // Check if room exists and user owns the pod
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        pod: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.pod.ownerId !== req.user!.id) {
      return res.status(403).json({ error: 'You are not the owner of this pod' });
    }

    await prisma.room.delete({
      where: { id: roomId }
    });

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Get messages in a room (with pagination)
router.get('/:roomId/messages', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { limit = '50', before } = req.query;

    // Check if room exists
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
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: room.pod.id,
          userId: req.user!.id
        }
      }
    });

    const isOwner = room.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view messages' });
    }

    const whereClause: any = {
      roomId
    };

    // If 'before' is provided, get messages before that message's createdAt
    if (before && typeof before === 'string') {
      const beforeMessage = await prisma.message.findUnique({
        where: { id: before },
        select: { createdAt: true }
      });

      if (beforeMessage) {
        whereClause.createdAt = {
          lt: beforeMessage.createdAt
        };
      }
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePhoto: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(typeof limit === 'string' ? limit : '50')
    });

    res.json({ messages: messages.reverse() }); // Reverse to show oldest first
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Add member to a private room (owner only)
router.post('/:roomId/members',
  authMiddleware,
  isPodOwner,
  [
    body('userId').notEmpty().withMessage('User ID is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId } = req.params;
      const { userId } = req.body;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          pod: {
            select: {
              ownerId: true
            }
          }
        }
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.pod.ownerId !== req.user!.id) {
        return res.status(403).json({ error: 'You are not the owner of this pod' });
      }

      // Check if already a member
      const existingMember = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId
          }
        }
      });

      if (existingMember) {
        return res.status(400).json({ error: 'User is already a member of this room' });
      }

      await prisma.roomMember.create({
        data: {
          roomId,
          userId
        }
      });

      res.json({ message: 'Member added successfully' });
    } catch (error) {
      console.error('Add room member error:', error);
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
);

// Remove member from room (owner only)
router.delete('/:roomId/members/:userId', authMiddleware, isPodOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId, userId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        pod: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.pod.ownerId !== req.user!.id) {
      return res.status(403).json({ error: 'You are not the owner of this pod' });
    }

    await prisma.roomMember.delete({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      }
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove room member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get questions in a Q&A room
router.get('/:roomId/questions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.params;

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
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.type !== 'QA') {
      return res.status(400).json({ error: 'This room is not a Q&A room' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: room.pod.id,
          userId: req.user!.id
        }
      }
    });

    const isOwner = room.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view questions' });
    }

    const questions = await prisma.question.findMany({
      where: { roomId },
      include: {
        author: {
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
        answers: {
          include: {
            author: {
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
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ questions });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Create a question in a Q&A room
router.post('/:roomId/questions',
  authMiddleware,
  [
    body('content').notEmpty().withMessage('Question content is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId } = req.params;
      const { content } = req.body;

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
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.type !== 'QA') {
        return res.status(400).json({ error: 'This room is not a Q&A room' });
      }

      // Check if user is a member or owner of the pod
      const isMember = await prisma.podMember.findUnique({
        where: {
          podId_userId: {
            podId: room.pod.id,
            userId: req.user!.id
          }
        }
      });

      const isOwner = room.pod.ownerId === req.user!.id;

      if (!isMember && !isOwner) {
        return res.status(403).json({ error: 'You must be a member of this pod to ask questions' });
      }

      const question = await prisma.question.create({
        data: {
          content,
          roomId,
          authorId: req.user!.id
        },
        include: {
          author: {
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
          answers: true
        }
      });

      res.status(201).json({ question });
    } catch (error) {
      console.error('Create question error:', error);
      res.status(500).json({ error: 'Failed to create question' });
    }
  }
);

// Delete a question
router.delete('/:roomId/questions/:questionId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { questionId } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        room: {
          include: {
            pod: {
              select: {
                ownerId: true
              }
            }
          }
        }
      }
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if user is the author or the pod owner
    const isAuthor = question.authorId === req.user!.id;
    const isPodOwner = question.room.pod.ownerId === req.user!.id;

    if (!isAuthor && !isPodOwner) {
      return res.status(403).json({ error: 'You do not have permission to delete this question' });
    }

    await prisma.question.delete({
      where: { id: questionId }
    });

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Get answers for a question
router.get('/:roomId/questions/:questionId/answers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { questionId } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        room: {
          include: {
            pod: {
              select: {
                id: true,
                ownerId: true
              }
            }
          }
        }
      }
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: question.room.pod.id,
          userId: req.user!.id
        }
      }
    });

    const isOwner = question.room.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view answers' });
    }

    const answers = await prisma.answer.findMany({
      where: { questionId },
      include: {
        author: {
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
        createdAt: 'asc'
      }
    });

    res.json({ answers });
  } catch (error) {
    console.error('Get answers error:', error);
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

// Add an answer to a question
router.post('/:roomId/questions/:questionId/answers',
  authMiddleware,
  [
    body('content').notEmpty().withMessage('Answer content is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { questionId } = req.params;
      const { content } = req.body;

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          room: {
            include: {
              pod: {
                select: {
                  id: true,
                  ownerId: true
                }
              }
            }
          }
        }
      });

      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check if user is a member or owner of the pod
      const isMember = await prisma.podMember.findUnique({
        where: {
          podId_userId: {
            podId: question.room.pod.id,
            userId: req.user!.id
          }
        }
      });

      const isOwner = question.room.pod.ownerId === req.user!.id;

      if (!isMember && !isOwner) {
        return res.status(403).json({ error: 'You must be a member of this pod to answer questions' });
      }

      const answer = await prisma.answer.create({
        data: {
          content,
          questionId,
          authorId: req.user!.id
        },
        include: {
          author: {
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

      res.status(201).json({ answer });
    } catch (error) {
      console.error('Create answer error:', error);
      res.status(500).json({ error: 'Failed to create answer' });
    }
  }
);

// Delete an answer
router.delete('/:roomId/questions/:questionId/answers/:answerId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { answerId } = req.params;

    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        question: {
          include: {
            room: {
              include: {
                pod: {
                  select: {
                    ownerId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!answer) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Check if user is the author or the pod owner
    const isAuthor = answer.authorId === req.user!.id;
    const isPodOwner = answer.question.room.pod.ownerId === req.user!.id;

    if (!isAuthor && !isPodOwner) {
      return res.status(403).json({ error: 'You do not have permission to delete this answer' });
    }

    await prisma.answer.delete({
      where: { id: answerId }
    });

    res.json({ message: 'Answer deleted successfully' });
  } catch (error) {
    console.error('Delete answer error:', error);
    res.status(500).json({ error: 'Failed to delete answer' });
  }
});

export default router;

