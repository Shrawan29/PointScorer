import bcrypt from 'bcrypt';
import User from '../models/User.model.js';
import Friend from '../models/Friend.model.js';
import PasswordResetRequest from '../models/PasswordResetRequest.model.js';

// Validation utilities
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
};

const validateName = (name) => {
  if (!name || name.trim().length < 2) {
    return false;
  }
  return name.trim().length <= 100;
};

const validateMaxFriends = (max) => {
  const num = parseInt(max);
  return !isNaN(num) && num > 0 && num <= 100;
};

// Get all users (admin only)
export const getAllUsers = async (req, res, next) => {
  try {
    const [users, friendCounts] = await Promise.all([
      User.find({}).select('-password').sort({ createdAt: -1 }).lean(),
      Friend.aggregate([
        {
          $group: {
            _id: '$userId',
            friendsCreatedCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const friendCountByUserId = new Map(
      friendCounts.map((row) => [String(row._id), Number(row.friendsCreatedCount) || 0])
    );

    const usersWithFriendCount = users.map((row) => ({
      ...row,
      friendsCreatedCount: friendCountByUserId.get(String(row._id)) || 0,
    }));

    return res.status(200).json(usersWithFriendCount);
  } catch (error) {
    next(error);
  }
};

// Create a new user (admin only)
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, isAdmin = false, maxFriendsAllowed = 10 } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Validate name
    if (!validateName(name)) {
      return res.status(400).json({ message: 'Name must be between 2 and 100 characters' });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    // Validate maxFriendsAllowed
    if (!validateMaxFriends(maxFriendsAllowed)) {
      return res.status(400).json({ message: 'Max friends must be between 1 and 100' });
    }

    // Check if email already exists (case-insensitive)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      isAdmin,
      maxFriendsAllowed: parseInt(maxFriendsAllowed),
    });

    await user.save();

    return res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isBlocked: user.isBlocked,
        maxFriendsAllowed: user.maxFriendsAllowed,
        canManageFriends: user.canManageFriends !== false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user by ID (admin only)
export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// Update user settings (admin only)
export const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, isAdmin, isBlocked, maxFriendsAllowed } = req.body;
    const adminId = req.userId;

    // Prevent self-demotion
    if (userId === adminId && isAdmin === false) {
      return res.status(400).json({ message: 'Cannot demote yourself from admin' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate and update name
    if (name !== undefined) {
      if (!validateName(name)) {
        return res.status(400).json({ message: 'Name must be between 2 and 100 characters' });
      }
      user.name = name.trim();
    }

    // Validate and update maxFriendsAllowed
    if (maxFriendsAllowed !== undefined) {
      if (!validateMaxFriends(maxFriendsAllowed)) {
        return res.status(400).json({ message: 'Max friends must be between 1 and 100' });
      }
      user.maxFriendsAllowed = parseInt(maxFriendsAllowed);
    }

    // Update flags
    if (isAdmin !== undefined) user.isAdmin = isAdmin;
    if (isBlocked !== undefined) user.isBlocked = isBlocked;

    await user.save();

    return res.status(200).json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isBlocked: user.isBlocked,
        maxFriendsAllowed: user.maxFriendsAllowed,
        canManageFriends: user.canManageFriends !== false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Block/Unblock user (admin only)
export const toggleUserBlock = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    return res.status(200).json({
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isBlocked: user.isBlocked,
        maxFriendsAllowed: user.maxFriendsAllowed,
        canManageFriends: user.canManageFriends !== false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete user (admin only)
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.userId;

    // Prevent self-deletion
    if (userId === adminId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getPasswordResetRequests = async (req, res, next) => {
  try {
    const requestedStatus = String(req.query?.status || 'PENDING').toUpperCase();
    const allowed = new Set(['PENDING', 'COMPLETED', 'REJECTED', 'ALL']);
    const safeStatus = allowed.has(requestedStatus) ? requestedStatus : 'PENDING';

    const filter = safeStatus === 'ALL' ? {} : { status: safeStatus };
    const rows = await PasswordResetRequest.find(filter)
      .populate('userId', 'name email isBlocked')
      .populate('resolvedByAdminId', 'name email')
      .sort({ requestedAt: -1 })
      .lean();

    return res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
};

export const setTemporaryPasswordForResetRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { temporaryPassword, resolutionNote } = req.body || {};

    if (!requestId) {
      return res.status(400).json({ message: 'requestId is required' });
    }
    if (!temporaryPassword) {
      return res.status(400).json({ message: 'temporaryPassword is required' });
    }

    const passwordValidation = validatePassword(String(temporaryPassword));
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const resetRequest = await PasswordResetRequest.findById(requestId);
    if (!resetRequest) {
      return res.status(404).json({ message: 'Password reset request not found' });
    }
    if (resetRequest.status !== 'PENDING') {
      return res.status(409).json({ message: 'Password reset request is already resolved' });
    }

    const user = await User.findById(resetRequest.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(String(temporaryPassword), 10);
    user.password = hashedPassword;
    user.activeSessionId = null;
    user.activeSessionExpiresAt = null;
    await user.save();

    resetRequest.status = 'COMPLETED';
    resetRequest.resolvedAt = new Date();
    resetRequest.resolvedByAdminId = req.userId;
    resetRequest.resolutionNote = resolutionNote ? String(resolutionNote).trim() : 'Temporary password set by admin';
    await resetRequest.save();

    return res.status(200).json({
      message: 'Temporary password set successfully. User must login again.',
      request: resetRequest,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  toggleUserBlock,
  deleteUser,
  getPasswordResetRequests,
  setTemporaryPasswordForResetRequest,
};
