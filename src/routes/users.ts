import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { ApiResponse } from '../utils/responses';

const router = express.Router();

// Get user profile by ID
router.get('/:userId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        profilePhoto: true,
        organisationName: true,
        brandName: true,
        designation: true,
        workingExperienceFrom: true,
        workingExperienceTo: true,
        startupSubcategory: true,
        businessType: true,
        briefAboutOrganisation: true,
        operatingCity: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        twitterUrl: true,
        youtubeUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Get user by username
router.get('/username/:username', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { username } = req.params;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        profilePhoto: true,
        organisationName: true,
        brandName: true,
        designation: true,
        workingExperienceFrom: true,
        workingExperienceTo: true,
        startupSubcategory: true,
        businessType: true,
        briefAboutOrganisation: true,
        operatingCity: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        twitterUrl: true,
        youtubeUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user by username error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Search users
router.get('/search/query', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          {
            username: {
              contains: q,
              mode: 'insensitive'
            }
          },
          {
            fullName: {
              contains: q,
              mode: 'insensitive'
            }
          },
          {
            email: {
              contains: q,
              mode: 'insensitive'
            }
          }
        ]
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        profilePhoto: true,
        profilePhoto: true,
        role: true,
        organisationName: true,
        designation: true,
        operatingCity: true
      },
      take: 20
    });

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Update user profile (with userId parameter)
router.put('/:userId', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Verify the user is updating their own profile or is an admin
    if (req.user!.id !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Unauthorized to update this profile' });
      return;
    }

    // Define valid User model fields
    const validUserFields = [
      'mobile', 'fullName', 'bio', 'avatar', 'profilePhoto',
      'organisationName', 'brandName', 'designation',
      'workingExperienceFrom', 'workingExperienceTo',
      'startupSubcategory', 'businessType', 'briefAboutOrganisation',
      'operatingCity', 'website', 'linkedinUrl', 'instagramUrl',
      'facebookUrl', 'twitterUrl', 'youtubeUrl'
    ];

    // Filter to only include valid User fields
    const filteredUpdateData: any = {};
    validUserFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    // Map socialLinks to individual fields if provided
    if (updateData.socialLinks) {
      if (updateData.socialLinks.linkedin !== undefined) filteredUpdateData.linkedinUrl = updateData.socialLinks.linkedin;
      if (updateData.socialLinks.instagram !== undefined) filteredUpdateData.instagramUrl = updateData.socialLinks.instagram;
      if (updateData.socialLinks.facebook !== undefined) filteredUpdateData.facebookUrl = updateData.socialLinks.facebook;
      if (updateData.socialLinks.twitter !== undefined) filteredUpdateData.twitterUrl = updateData.socialLinks.twitter;
      if (updateData.socialLinks.youtube !== undefined) filteredUpdateData.youtubeUrl = updateData.socialLinks.youtube;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: filteredUpdateData,
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        profilePhoto: true,
        organisationName: true,
        brandName: true,
        designation: true,
        workingExperienceFrom: true,
        workingExperienceTo: true,
        startupSubcategory: true,
        businessType: true,
        briefAboutOrganisation: true,
        operatingCity: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        twitterUrl: true,
        youtubeUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update user profile (authenticated user's own profile)
router.put('/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.password;
    delete updateData.email;
    delete updateData.username;
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        profilePhoto: true,
        organisationName: true,
        brandName: true,
        designation: true,
        workingExperienceFrom: true,
        workingExperienceTo: true,
        startupSubcategory: true,
        businessType: true,
        briefAboutOrganisation: true,
        operatingCity: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        twitterUrl: true,
        youtubeUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Complete user registration
router.post('/complete-registration', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const updateData = req.body;

    // Remove sensitive fields
    delete updateData.password;
    delete updateData.email;
    delete updateData.username;
    delete updateData.id;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        mobile: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        profilePhoto: true,
        organisationName: true,
        brandName: true,
        designation: true,
        workingExperienceFrom: true,
        workingExperienceTo: true,
        startupSubcategory: true,
        businessType: true,
        briefAboutOrganisation: true,
        operatingCity: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        twitterUrl: true,
        youtubeUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Complete registration error:', error);
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

// Upload profile photo (placeholder - in production, use proper file upload service)
router.post('/upload-photo', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { photoUrl } = req.body;

    if (!photoUrl) {
      res.status(400).json({ error: 'Photo URL is required' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        profilePhoto: photoUrl,
        avatar: photoUrl
      },
      select: {
        id: true,
        profilePhoto: true,
        profilePhoto: true
      }
    });

    res.json({ photoUrl: updatedUser.profilePhoto });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Get user's pods (owned and joined)
router.get('/:userId/pods', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Get pods owned by user
    const ownedPods = await prisma.pod.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePhoto: true
          }
        },
        _count: {
          select: {
            members: true,
            posts: true
          }
        }
      }
    });

    // Get pods where user is a member
    const memberPods = await prisma.podMember.findMany({
      where: { userId },
      include: {
        pod: {
          include: {
            owner: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profilePhoto: true
              }
            },
            _count: {
              select: {
                members: true,
                posts: true
              }
            }
          }
        }
      }
    });

    // Combine and format the results
    const pods = [
      ...ownedPods,
      ...memberPods.map(m => m.pod)
    ];

    res.json({ pods });
  } catch (error) {
    console.error('Get user pods error:', error);
    res.status(500).json({ error: 'Failed to fetch user pods' });
  }
});

export default router;

