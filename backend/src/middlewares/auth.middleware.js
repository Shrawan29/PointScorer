import jwt from 'jsonwebtoken';
import ENV from '../config/env.js';

export const authMiddleware = (req, res, next) => {
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

    // Attach userId to request
    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default authMiddleware;
