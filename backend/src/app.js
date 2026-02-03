import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import friendRoutes from './routes/friend.routes.js';
import rulesetRoutes from './routes/ruleset.routes.js';
import matchRoutes from './routes/match.routes.js';
import playerSelectionRoutes from './routes/playerSelection.routes.js';
import historyRoutes from './routes/history.routes.js';
import shareRoutes from './routes/share.routes.js';
import cricketRoutes from './routes/cricket.routes.js';
import scoringRoutes from './routes/scoring.routes.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  const readyState = mongoose.connection?.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbStatus = readyState === 1 ? 'connected' : readyState === 2 ? 'connecting' : 'disconnected';
  res.status(200).json({ status: 'OK', db: dbStatus });
});

// If DB isn't connected yet (common on Railway cold starts), fail fast for API calls.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!String(req.path || '').startsWith('/api/')) return next();
  const readyState = mongoose.connection?.readyState;
  if (readyState !== 1) {
    return res.status(503).json({ message: 'Database not connected yet. Please retry in a few seconds.' });
  }
  return next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/rulesets', rulesetRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/player-selections', playerSelectionRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/cricket', cricketRoutes);
app.use('/api/scoring', scoringRoutes);

// Serve frontend build (single-server deploy) + SPA fallback
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    // eslint-disable-next-line no-console
    console.log('[App] Serving frontend from:', distPath);
    app.use(express.static(distPath));
    // Express 5 + path-to-regexp v6: use a RegExp route for SPA fallback.
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (req.path === '/health') return next();
      return res.sendFile(indexPath);
    });
  }
} catch {
  // ignore static serve errors
}

// Error handling middleware
app.use(errorMiddleware);

export default app;
