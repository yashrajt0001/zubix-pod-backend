import express, { Response } from 'express';
import { authMiddleware, isPodOwner, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma.js';

const router = express.Router();

// Get all events in a pod
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
      return res.status(403).json({ error: 'You must be a member of this pod to view events' });
    }

    const events = await prisma.event.findMany({
      where: { podId },
      include: {
        pod: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
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
        },
        _count: {
          select: {
            participants: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Check which events the current user has joined
    const eventsWithJoinStatus = events.map(event => ({
      ...event,
      hasJoined: event.participants.some(p => p.userId === req.user!.id)
    }));

    res.json({ events: eventsWithJoinStatus });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get all events from user's joined pods
router.get('/feed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get all pods user is a member of
    const memberships = await prisma.podMember.findMany({
      where: { userId: req.user!.id },
      select: { podId: true }
    });

    // Get all pods user owns
    const ownedPods = await prisma.pod.findMany({
      where: { ownerId: req.user!.id },
      select: { id: true }
    });

    // Combine both member and owned pod IDs
    const memberPodIds = memberships.map(m => m.podId);
    const ownedPodIds = ownedPods.map(p => p.id);
    const podIds = [...new Set([...memberPodIds, ...ownedPodIds])]; // Remove duplicates

    if (podIds.length === 0) {
      return res.json({ events: [] });
    }

    const events = await prisma.event.findMany({
      where: {
        podId: {
          in: podIds
        }
      },
      include: {
        pod: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true,
                email: true,
                mobile: true,
                profilePhoto: true,
                role: true,
                createdAt: true
              }
            }
          }
        },
        _count: {
          select: {
            participants: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Check which events the current user has joined
    const eventsWithJoinStatus = events.map(event => ({
      ...event,
      hasJoined: event.participants.some(p => p.userId === req.user!.id)
    }));

    res.json({ events: eventsWithJoinStatus });
  } catch (error) {
    console.error('Get events feed error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get a single event by ID
router.get('/:eventId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        pod: {
          select: {
            id: true,
            name: true,
            avatar: true,
            ownerId: true
          }
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                mobile: true,
                profilePhoto: true,
                role: true,
                createdAt: true
              }
            }
          },
          orderBy: {
            joinedAt: 'desc'
          }
        },
        _count: {
          select: {
            participants: true
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: event.podId,
          userId: req.user!.id
        }
      }
    });

    const isOwner = event.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view this event' });
    }

    const hasJoined = event.participants.some(p => p.userId === req.user!.id);

    res.json({ event: { ...event, hasJoined } });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create an event (pod owner only)
router.post('/',
  authMiddleware,
  isPodOwner,
  [
    body('name').isLength({ min: 3 }).withMessage('Event name must be at least 3 characters'),
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('type').isIn(['ONLINE', 'OFFLINE']).withMessage('Type must be ONLINE or OFFLINE'),
    body('date').isISO8601().withMessage('Date must be a valid date'),
    body('time').notEmpty().withMessage('Time is required'),
    body('location').optional().isString(),
    body('helpline').optional().isString(),
    body('imageUrl').optional().isString(),
    body('podId').notEmpty().withMessage('Pod ID is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, title, description, type, date, time, location, helpline, imageUrl, podId } = req.body;

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

      const event = await prisma.event.create({
        data: {
          name: name || title,
          title,
          description,
          type,
          date: new Date(date),
          time,
          location,
          helpline,
          imageUrl,
          podId,
          createdBy: req.user!.id
        },
        include: {
          pod: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          _count: {
            select: {
              participants: true
            }
          }
        }
      });

      res.status(201).json({ event });
    } catch (error) {
      console.error('Create event error:', error);
      res.status(500).json({ error: 'Failed to create event' });
    }
  }
);

// Update an event (pod owner only)
router.put('/:eventId',
  authMiddleware,
  isPodOwner,
  [
    body('title').optional().isLength({ min: 3 }),
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('type').optional().isIn(['online', 'offline']),
    body('date').optional().isISO8601(),
    body('time').optional().isString(),
    body('location').optional().isString(),
    body('helpline').optional().isString(),
    body('imageUrl').optional().isString()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { eventId } = req.params;
      const { name, title, description, type, date, time, location, helpline, imageUrl } = req.body;

      // Check if event exists and user owns the pod
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          pod: {
            select: {
              ownerId: true
            }
          }
        }
      });

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (event.pod.ownerId !== req.user!.id) {
        return res.status(403).json({ error: 'You are not the owner of this pod' });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (date !== undefined) updateData.date = new Date(date);
      if (time !== undefined) updateData.time = time;
      if (location !== undefined) updateData.location = location;
      if (helpline !== undefined) updateData.helpline = helpline;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

      const updatedEvent = await prisma.event.update({
        where: { id: eventId },
        data: updateData,
        include: {
          pod: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          _count: {
            select: {
              participants: true
            }
          }
        }
      });

      res.json({ event: updatedEvent });
    } catch (error) {
      console.error('Update event error:', error);
      res.status(500).json({ error: 'Failed to update event' });
    }
  }
);

// Delete an event (pod owner only)
router.delete('/:eventId', authMiddleware, isPodOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    // Check if event exists and user owns the pod
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        pod: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.pod.ownerId !== req.user!.id) {
      return res.status(403).json({ error: 'You are not the owner of this pod' });
    }

    await prisma.event.delete({
      where: { id: eventId }
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Join an event
router.post('/:eventId/join', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        pod: {
          select: {
            id: true,
            ownerId: true
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Prevent event creator from joining their own event
    if (event.createdBy === req.user!.id) {
      return res.status(403).json({ error: 'Event creators cannot join their own events' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: event.podId,
          userId: req.user!.id
        }
      }
    });

    const isOwner = event.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to join events' });
    }

    // Check if already joined
    const existingParticipant = await prisma.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId: req.user!.id
        }
      }
    });

    if (existingParticipant) {
      return res.status(400).json({ error: 'Already joined this event' });
    }

    const participant = await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: req.user!.id
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        event: {
          include: {
            pod: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({ participant });
  } catch (error) {
    console.error('Join event error:', error);
    res.status(500).json({ error: 'Failed to join event' });
  }
});

// Leave an event
router.post('/:eventId/leave', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    const participant = await prisma.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId: req.user!.id
        }
      }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Not a participant of this event' });
    }

    await prisma.eventParticipant.delete({
      where: {
        eventId_userId: {
          eventId,
          userId: req.user!.id
        }
      }
    });

    res.json({ message: 'Left event successfully' });
  } catch (error) {
    console.error('Leave event error:', error);
    res.status(500).json({ error: 'Failed to leave event' });
  }
});

// Get participants of an event
router.get('/:eventId/participants', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        pod: {
          select: {
            id: true,
            ownerId: true
          }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is a member or owner of the pod
    const isMember = await prisma.podMember.findUnique({
      where: {
        podId_userId: {
          podId: event.podId,
          userId: req.user!.id
        }
      }
    });

    const isOwner = event.pod.ownerId === req.user!.id;

    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'You must be a member of this pod to view participants' });
    }

    const participants = await prisma.eventParticipant.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            mobile: true,
            profilePhoto: true,
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        joinedAt: 'desc'
      }
    });

    res.json({ participants });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

export default router;
