import express from 'express';
import cors from 'cors';
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
  res.status(200).json({ status: 'OK' });
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

// Error handling middleware
app.use(errorMiddleware);

export default app;
