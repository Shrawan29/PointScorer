import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.model.js';
import ENV from '../config/env.js';

const parseExpiresInMs = (value) => {
  // Supports jsonwebtoken-style short strings like '7d', '12h', '30m', '15s'
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  const v = String(value || '').trim();
  const m = v.match(/^([0-9]+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
};

const newSessionId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
    });

    await user.save();

    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account has been blocked by admin. Please contact support.' });
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Enforce one active session at a time
    const now = new Date();
    if (user.activeSessionId && user.activeSessionExpiresAt && user.activeSessionExpiresAt > now) {
      return res.status(409).json({
        message:
          'You are already logged in on another device. Please logout there or wait for the session to expire.',
      });
    }

    const sessionId = newSessionId();
    const expiresAt = new Date(Date.now() + parseExpiresInMs(ENV.JWT_EXPIRES_IN));
    user.activeSessionId = sessionId;
    user.activeSessionExpiresAt = expiresAt;
    await user.save();

    // Generate JWT
    const token = jwt.sign({ userId: user._id, sessionId }, ENV.JWT_SECRET, {
      expiresIn: ENV.JWT_EXPIRES_IN,
    });

    // Return token and user object (without password)
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
	try {
		const userId = req.userId;
		if (!userId) return res.status(401).json({ message: 'Unauthorized' });

		await User.updateOne(
			{ _id: userId },
			{ $set: { activeSessionId: null, activeSessionExpiresAt: null } }
		);
		return res.status(200).json({ ok: true });
	} catch (error) {
		next(error);
	}
};

export const forceLogoutOtherSession = async (req, res, next) => {
	try {
		const { email, password } = req.body;

		// Validate input
		if (!email || !password) {
			return res.status(400).json({ message: 'Email and password are required' });
		}

		// Find user by email
		const user = await User.findOne({ email });
		if (!user) {
			return res.status(401).json({ message: 'Invalid email or password' });
		}

		// Compare passwords
		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return res.status(401).json({ message: 'Invalid email or password' });
		}

		// Clear the old session
		user.activeSessionId = null;
		user.activeSessionExpiresAt = null;
		await user.save();

		// Create new session for this device
		const sessionId = newSessionId();
		const expiresAt = new Date(Date.now() + parseExpiresInMs(ENV.JWT_EXPIRES_IN));
		user.activeSessionId = sessionId;
		user.activeSessionExpiresAt = expiresAt;
		await user.save();

		// Generate JWT
		const token = jwt.sign({ userId: user._id, sessionId }, ENV.JWT_SECRET, {
			expiresIn: ENV.JWT_EXPIRES_IN,
		});

		// Return token and user object (without password)
		return res.status(200).json({
			token,
			user: {
				id: user._id,
				name: user.name,
				email: user.email,
				isAdmin: user.isAdmin,
			},
		});
	} catch (error) {
		next(error);
	}
};

export default { register, login, logout, forceLogoutOtherSession };
