import express from 'express';
import {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  toggleUserBlock,
  deleteUser,
} from '../controllers/admin.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import User from '../models/User.model.js';

const router = express.Router();

// All admin routes require auth
router.use(authMiddleware);

// Admin check middleware
const adminCheckMiddleware = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Apply admin check to all routes
router.use(adminCheckMiddleware);

// Admin user management routes
router.get('/users', getAllUsers);
router.post('/users/create', createUser);
router.get('/users/:userId', getUserById);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/toggle-block', toggleUserBlock);
router.delete('/users/:userId', deleteUser);

export default router;
