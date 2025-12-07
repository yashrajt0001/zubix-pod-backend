import express, { Response } from 'express';
import { authMiddleware, isPodOwner, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { checkPodMembership, checkPodOwnership } from '../utils/permissions';

const router = express.Router();

// Get posts from a specific pod (owner updates, member updates, or all)
router.get('/pod/:podId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { podId } = req.params;
    const { type } = req.query; // 'owner', 'member', or 'all'

    // Check if user is a member of the pod
    const isMember = await checkPodMembership(podId, req.user!.id);
    const isOwner = await checkPodOwnership(podId, req.user!.id);

    if (!isMember && !isOwner) {
      res.status(403).json({ error: 'You must be a member of this pod to view posts' });
      return;
    }

    const whereClause: any = {
      podId
    };

    // Filter by post type if specified
    if (type === 'owner') {
      whereClause.type = 'OWNER_UPDATE';
    } else if (type === 'member') {
      whereClause.type = 'MEMBER_UPDATE';
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        author: {
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
        },
        pod: {
          select: {
            id: true,
            name: true
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        },
        _count: {
          select: {
            reactions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ posts });
  } catch (error) {
    console.error('Get pod posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get posts from all joined pods
router.get('/feed', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.query; // 'owner', 'member', or 'all'

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

    // Combine member pod IDs and owned pod IDs
    const memberPodIds = memberships.map(m => m.podId);
    const ownedPodIds = ownedPods.map(p => p.id);
    const allPodIds = [...new Set([...memberPodIds, ...ownedPodIds])];

    if (allPodIds.length === 0) {
      res.json({ posts: [] });
      return;
    }

    const whereClause: any = {
      podId: {
        in: allPodIds
      }
    };

    // Filter by post type if specified
    if (type === 'owner') {
      whereClause.type = 'OWNER_UPDATE';
    } else if (type === 'member') {
      whereClause.type = 'MEMBER_UPDATE';
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        author: {
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
        },
        pod: {
          select: {
            id: true,
            name: true,
          }
        },
        reactions: {
          select: {
            id: true,
            userId: true,
            type: true
          }
        },
        comments: {
          select: {
            id: true
          }
        },
        _count: {
          select: {
            reactions: true,
            comments: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform posts to include likes array and comments array
    const transformedPosts = posts.map(post => ({
      ...post,
      likes: post.reactions.filter(r => r.type === 'like').map(r => r.userId),
      comments: post.comments.map(c => c.id)
    }));

    res.json({ posts: transformedPosts });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Get a single post by ID
router.get('/:postId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
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
        },
        pod: {
          select: {
            id: true,
            name: true,
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profilePhoto: true
              }
            }
          }
        },
        comments: {
          include: {
            author: {
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
            createdAt: 'asc'
          }
        },
        _count: {
          select: {
            reactions: true,
            comments: true
          }
        }
      }
    });

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Check if user is a member of the pod
    const isMember = await checkPodMembership(post.podId, req.user!.id);
    const isOwner = await checkPodOwnership(post.podId, req.user!.id);

    if (!isMember && !isOwner) {
      res.status(403).json({ error: 'You must be a member of this pod to view this post' });
      return;
    }

    // Transform post to include likes array and isOwnerPost flag
    const transformedPost = {
      ...post,
      likes: post.reactions.filter(r => r.type === 'like').map(r => r.userId),
      isOwnerPost: post.authorId === post.pod.id || await checkPodOwnership(post.podId, post.authorId)
    };

    res.json({ post: transformedPost });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create a post in a pod
router.post('/',
  authMiddleware,
  [
    body('content').notEmpty().withMessage('Content is required'),
    body('podId').notEmpty().withMessage('Pod ID is required'),
    body('mediaUrls').optional().isArray()
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { content, podId, mediaUrls = [] } = req.body;

      // Check if user is member or owner of the pod
      const isMember = await checkPodMembership(podId, req.user!.id);
      const isOwner = await checkPodOwnership(podId, req.user!.id);

      if (!isMember && !isOwner) {
        res.status(403).json({ error: 'You must be a member of this pod to create posts' });
        return;
      }

      // Determine post type based on whether user is owner
      const postType = isOwner ? 'OWNER_UPDATE' : 'MEMBER_UPDATE';

      const post = await prisma.post.create({
        data: {
          content,
          mediaUrls,
          type: postType,
          podId,
          authorId: req.user!.id,
          isOwnerPost: isOwner
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profilePhoto: true
            }
          },
          pod: {
            select: {
              id: true,
              name: true,
            }
          },
          _count: {
            select: {
              reactions: true
            }
          }
        }
      });

      res.status(201).json({ post });
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ error: 'Failed to create post' });
    }
  }
);

// Update a post
router.put('/:postId',
  authMiddleware,
  [
    body('content').optional().notEmpty().withMessage('Content cannot be empty'),
    body('mediaUrls').optional().isArray()
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { postId } = req.params;
      const { content, mediaUrls } = req.body;

      // Check if post exists and user is the author
      const post = await prisma.post.findUnique({
        where: { id: postId }
      });

      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      if (post.authorId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit your own posts' });
        return;
      }

      const updatedPost = await prisma.post.update({
        where: { id: postId },
        data: {
          ...(content && { content }),
          ...(mediaUrls !== undefined && { mediaUrls })
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profilePhoto: true
            }
          },
          pod: {
            select: {
              id: true,
              name: true,
            }
          },
          _count: {
            select: {
              reactions: true
            }
          }
        }
      });

      res.json({ post: updatedPost });
    } catch (error) {
      console.error('Update post error:', error);
      res.status(500).json({ error: 'Failed to update post' });
    }
  }
);

// Delete a post (author can delete own post, pod owner can delete any post in their pod)
router.delete('/:postId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        pod: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Check if user is the author or the pod owner
    const isAuthor = post.authorId === req.user!.id;
    const isPodOwner = post.pod.ownerId === req.user!.id;

    if (!isAuthor && !isPodOwner) {
      res.status(403).json({ error: 'You do not have permission to delete this post' });
      return;
    }

    await prisma.post.delete({
      where: { id: postId }
    });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Get comments for a post
router.get('/:postId/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { podId: true }
    });

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // Check if user is a member of the pod
    const isMember = await checkPodMembership(post.podId, req.user!.id);
    const isOwner = await checkPodOwnership(post.podId, req.user!.id);

    if (!isMember && !isOwner) {
      res.status(403).json({ error: 'You must be a member of this pod to view comments' });
      return;
    }

    const comments = await prisma.comment.findMany({
      where: { postId },
      include: {
        author: {
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
        createdAt: 'asc'
      }
    });

    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment to a post
router.post('/:postId/comments',
  authMiddleware,
  [
    body('content').notEmpty().withMessage('Comment content is required')
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { postId } = req.params;
      const { content } = req.body;

      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { podId: true }
      });

      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      // Check if user is a member of the pod
      const isMember = await checkPodMembership(post.podId, req.user!.id);
      const isOwner = await checkPodOwnership(post.podId, req.user!.id);

      if (!isMember && !isOwner) {
        res.status(403).json({ error: 'You must be a member of this pod to comment' });
        return;
      }

      const comment = await prisma.comment.create({
        data: {
          content,
          postId,
          authorId: req.user!.id
        },
        include: {
          author: {
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
        }
      });

      res.status(201).json({ comment });
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }
);

// Delete a comment
router.delete('/:postId/comments/:commentId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
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

    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    // Check if user is the author or the pod owner
    const isAuthor = comment.authorId === req.user!.id;
    const isPodOwner = comment.post.pod.ownerId === req.user!.id;

    if (!isAuthor && !isPodOwner) {
      res.status(403).json({ error: 'You do not have permission to delete this comment' });
      return;
    }

    await prisma.comment.delete({
      where: { id: commentId }
    });

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Upload media (placeholder)
router.post('/upload-media', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { mediaUrl } = req.body;

    if (!mediaUrl) {
      res.status(400).json({ error: 'Media URL is required' });
      return;
    }

    // In production, handle actual file upload to cloud storage
    res.json({ mediaUrl });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

export default router;

