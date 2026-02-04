import jwt from 'jsonwebtoken';
import ENV from '../config/env.js';
import User from '../models/User.model.js';

export const authMiddleware = async (req, res, next) => {
  try {
    // Read Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    // Extract token
    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, ENV.JWT_SECRET);

    // Require sessionId (forces re-login after upgrade, and enables single-session enforcement)
    if (!decoded?.sessionId) {
      return res.status(401).json({ message: 'Please login again' });
    }

    const user = await User.findById(decoded.userId).select('activeSessionId activeSessionExpiresAt').lean();
    if (!user || !user.activeSessionId || !user.activeSessionExpiresAt) {
      return res.status(401).json({ message: 'Session not active. Please login again' });
    }
    if (String(user.activeSessionId) !== String(decoded.sessionId)) {
      return res.status(401).json({ message: 'Logged in on another device' });
    }
    if (new Date(user.activeSessionExpiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ message: 'Session expired. Please login again' });
    }

    // Attach userId to request
    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default authMiddleware;
