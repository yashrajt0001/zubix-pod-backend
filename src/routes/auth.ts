import express, { Response } from 'express';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import prisma from '../utils/prisma';

const router = express.Router();

// Signup handler function (used by both /signup and /register)
const signupHandler = [
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Invalid email'),
  body('mobile').notEmpty().withMessage('Mobile is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const signupController = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { fullName, email, mobile, password } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { mobile }
        ]
      }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email or mobile already exists' });
      return;
    }

    // Generate username from email
    const username = email.split('@')[0] + Math.random().toString(36).substring(7);

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        mobile,
        username,
        password: hashedPassword,
        fullName,
        role: 'USER'
      },
      select: {
        id: true,
        email: true,
        mobile: true,
        username: true,
        role: true,
        fullName: true,
        profilePhoto: true,
        createdAt: true
      }
    });

    // Generate token
    const token = generateToken(user.id, user.role);

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Signup (preferred endpoint)
router.post('/signup', signupHandler, signupController);

// Register (alias for signup)
router.post('/register', signupHandler, signupController);

// Login
router.post('/login',
  [
    body('emailOrMobile').notEmpty().withMessage('Email or mobile is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { emailOrMobile, password } = req.body;

      // Find user by email or mobile
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: emailOrMobile },
            { mobile: emailOrMobile }
          ]
        }
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Check password
      const isValidPassword = await comparePassword(password, user.password);

      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Generate token
      const token = generateToken(user.id, user.role);

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;

      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({ user: req.user });
});


// Update user role to POD_OWNER
router.put('/role/pod-owner', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { role: 'POD_OWNER' },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        fullName: true,
        bio: true,
        profilePhoto: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Generate new token with updated role
    const token = generateToken(updatedUser.id, updatedUser.role);

    res.json({ user: updatedUser, token });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ error: 'Role update failed' });
  }
});

// Update profile
router.put('/profile', authMiddleware,
  [
    body('fullName').optional().isString(),
    body('bio').optional().isString(),
    body('avatar').optional().isURL()
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { fullName, bio, avatar } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          ...(fullName && { fullName }),
          ...(bio && { bio }),
          ...(avatar && { avatar })
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          fullName: true,
          bio: true,
          profilePhoto: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.json({ user: updatedUser });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Profile update failed' });
    }
  }
);

export default router;
