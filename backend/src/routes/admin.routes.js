import express from 'express';
import {
  checkAdmin,
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  toggleUserBlock,
  deleteUser,
} from '../controllers/admin.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

// All admin routes require auth
router.use(authMiddleware);

// Middleware to check if user is admin
router.use(async (req, res, next) => {
  const adminCheck = checkAdmin.bind({});
  adminCheck(req, res, () => {
    if (res.statusCode && res.statusCode >= 400) {
      return; // Error already sent
    }
    next();
  });
});

// Admin user management routes
router.get('/users', getAllUsers);
router.post('/users/create', createUser);
router.get('/users/:userId', getUserById);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/toggle-block', toggleUserBlock);
router.delete('/users/:userId', deleteUser);

export default router;
