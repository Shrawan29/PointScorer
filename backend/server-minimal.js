import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  scrapeTodayAndLiveMatches,
  scrapeUpcomingMatches,
  scrapeMatchSquadsAndPlayingXI,
} from './src/services/scraper.service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// In-memory storage for dev/testing
const friends = [];
const sessions = [];
const selectionsBySessionId = new Map();
const pointsBySessionId = new Map();

app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Auth middleware - allow any Bearer token for testing
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  console.log('[API] Authorized request with Bearer token');
  next();
});

// Friends endpoints (minimal stubs for frontend dev)
app.get('/api/friends', (req, res) => {
	res.status(200).json(friends);
});

app.post('/api/friends', (req, res) => {
  const { friendName } = req.body || {};
  if (!friendName || !String(friendName).trim()) {
    return res.status(400).json({ message: 'friendName is required' });
  }

  const created = {
    _id: `dev-friend-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    friendName: String(friendName).trim(),
  };

  friends.unshift(created);

  return res.status(201).json(created);
});

app.delete('/api/friends/:friendId', (req, res) => {
	const { friendId } = req.params;
	const idx = friends.findIndex((f) => String(f?._id) === String(friendId));
	if (idx === -1) return res.status(404).json({ message: 'Friend not found' });
	friends.splice(idx, 1);
	return res.status(200).json({ message: 'Friend deleted successfully' });
});

// Matches endpoint - returns REAL scraped data
app.get('/api/matches', async (req, res) => {
  try {
    console.log('[API] GET /api/matches - Fetching live and upcoming matches...');
    const [todayMatches, upcomingMatches] = await Promise.all([
      scrapeTodayAndLiveMatches(),
      scrapeUpcomingMatches(),
    ]);
    
    console.log(`[API] Returning ${todayMatches.length} today/live matches and ${upcomingMatches.length} upcoming matches`);
    
    res.status(200).json({ 
      todayMatches: todayMatches || [], 
      upcomingMatches: upcomingMatches || [] 
    });
  } catch (error) {
    console.error('[API] Error fetching matches:', error.message);
    res.status(502).json({ 
      error: 'Failed to fetch matches',
      message: error.message 
    });
  }
});

// Match sessions (minimal stubs for frontend dev)
app.post('/api/matches', (req, res) => {
  const { friendId, rulesetId, realMatchId, realMatchName } = req.body || {};
  if (!friendId || !rulesetId || !realMatchId || !realMatchName) {
    return res.status(400).json({ message: 'friendId, rulesetId, realMatchId, and realMatchName are required' });
  }

  const created = {
    _id: `dev-session-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    userId: 'dev-user',
    friendId,
    rulesetId,
    realMatchId: String(realMatchId),
    realMatchName: String(realMatchName),
    status: 'UPCOMING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  sessions.unshift(created);
  return res.status(201).json(created);
});

app.get('/api/matches/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.find((s) => String(s?._id) === String(sessionId));
  if (!session) return res.status(404).json({ message: 'MatchSession not found' });
  return res.status(200).json(session);
});

app.get('/api/matches/friend/:friendId', (req, res) => {
  const { friendId } = req.params;
  const onlyFrozen = String(req.query.onlyFrozen ?? 'true').toLowerCase() !== 'false';
  const list = sessions
    .filter((s) => String(s?.friendId) === String(friendId))
    .map((s) => ({
      ...s,
      selectionFrozen: Boolean(selectionsBySessionId.get(String(s._id))?.isFrozen),
    }));
  return res.status(200).json(onlyFrozen ? list.filter((s) => s.selectionFrozen) : list);
});

// Player selections (minimal stubs for frontend dev)
app.get('/api/player-selections/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sel = selectionsBySessionId.get(String(sessionId));
  if (!sel) return res.status(404).json({ message: 'PlayerSelection not found' });
  return res.status(200).json(sel);
});

app.post('/api/player-selections', (req, res) => {
  const { sessionId, userPlayers, userCaptain, friendPlayers, friendCaptain } = req.body || {};
  if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
  const session = sessions.find((s) => String(s?._id) === String(sessionId));
  if (!session) return res.status(404).json({ message: 'MatchSession not found' });

  const existing = selectionsBySessionId.get(String(sessionId));
  if (existing?.isFrozen) return res.status(409).json({ message: 'Selection is frozen and cannot be updated' });

  const created = {
    _id: existing?._id || `dev-selection-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    sessionId,
    userPlayers: Array.isArray(userPlayers) ? userPlayers : [],
    userCaptain: userCaptain || null,
    friendPlayers: Array.isArray(friendPlayers) ? friendPlayers : [],
    friendCaptain: friendCaptain || null,
    // legacy compat
    selectedPlayers: Array.isArray(userPlayers) ? userPlayers : [],
    captain: userCaptain || null,
    isFrozen: existing?.isFrozen || false,
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  selectionsBySessionId.set(String(sessionId), created);
  pointsBySessionId.delete(String(sessionId));
  return res.status(existing ? 200 : 201).json(created);
});

app.post('/api/player-selections/freeze/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const existing = selectionsBySessionId.get(String(sessionId));
  if (!existing) return res.status(404).json({ message: 'PlayerSelection not found' });
  if (existing.isFrozen) return res.status(409).json({ message: 'Selection is already frozen' });

  const frozen = { ...existing, isFrozen: true, updatedAt: new Date().toISOString() };
  selectionsBySessionId.set(String(sessionId), frozen);
  pointsBySessionId.delete(String(sessionId));
  return res.status(200).json(frozen);
});

// History result (minimal)
app.get('/api/history/match/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.find((s) => String(s?._id) === String(sessionId));
  if (!session) return res.status(404).json({ message: 'MatchSession not found' });
  const selection = selectionsBySessionId.get(String(sessionId)) || null;
  const points = pointsBySessionId.get(String(sessionId)) || [];
  const userTotalPoints = Array.isArray(points)
    ? points
        .filter((r) => String(r?.team || 'USER') === 'USER')
        .reduce((sum, r) => sum + Number(r?.totalPoints || 0), 0)
    : 0;
  const friendTotalPoints = Array.isArray(points)
    ? points
        .filter((r) => String(r?.team || 'USER') === 'FRIEND')
        .reduce((sum, r) => sum + Number(r?.totalPoints || 0), 0)
    : 0;
  const totalPoints = userTotalPoints + friendTotalPoints;
  return res.status(200).json({
    match: session,
    captain: selection?.captain || selection?.userCaptain || null,
    userCaptain: selection?.userCaptain || selection?.captain || null,
    friendCaptain: selection?.friendCaptain || null,
    userPlayers: Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
      ? selection.userPlayers
      : Array.isArray(selection?.selectedPlayers)
        ? selection.selectedPlayers
        : [],
    friendPlayers: Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [],
    selectionFrozen: Boolean(selection?.isFrozen),
    matchState: 'UNKNOWN',
    playerWisePoints: points,
    userTotalPoints,
    friendTotalPoints,
    totalPoints,
  });
});

// Scoring calculate (minimal: assigns 0 points for selected players)
app.post('/api/scoring/session/:sessionId/calculate', (req, res) => {
  const { sessionId } = req.params;
  const force = String(req.query?.force ?? req.body?.force ?? 'false').toLowerCase() === 'true';
  const session = sessions.find((s) => String(s?._id) === String(sessionId));
  if (!session) return res.status(404).json({ message: 'MatchSession not found' });
  const selection = selectionsBySessionId.get(String(sessionId));
  if (!selection) return res.status(404).json({ message: 'PlayerSelection not found' });
  if (!selection.isFrozen) return res.status(409).json({ message: 'PlayerSelection must be frozen' });
  if (pointsBySessionId.get(String(sessionId))?.length && !force) {
    return res.status(200).json({ message: 'Points already calculated for this session' });
  }

  if (force) {
    pointsBySessionId.delete(String(sessionId));
  }

  const userPlayers = Array.isArray(selection.userPlayers) && selection.userPlayers.length > 0
    ? selection.userPlayers
    : Array.isArray(selection.selectedPlayers)
      ? selection.selectedPlayers
      : [];
  const friendPlayers = Array.isArray(selection.friendPlayers) ? selection.friendPlayers : [];

  const docs = [
    ...userPlayers.map((playerId) => ({
      _id: `dev-points-${String(sessionId)}-USER-${String(playerId)}`,
      sessionId,
      team: 'USER',
      playerId,
      totalPoints: 0,
      ruleWiseBreakdown: {},
    })),
    ...friendPlayers.map((playerId) => ({
      _id: `dev-points-${String(sessionId)}-FRIEND-${String(playerId)}`,
      sessionId,
      team: 'FRIEND',
      playerId,
      totalPoints: 0,
      ruleWiseBreakdown: {},
    })),
  ];
  pointsBySessionId.set(String(sessionId), docs);
  return res.status(201).json({ message: 'Points calculated successfully', count: docs.length });
});

// Scoring refresh (minimal: reuses calculate to keep UI flow working)
app.post('/api/scoring/session/:sessionId/refresh', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.find((s) => String(s?._id) === String(sessionId));
  if (!session) return res.status(404).json({ message: 'MatchSession not found' });
  const selection = selectionsBySessionId.get(String(sessionId));
  if (!selection) return res.status(404).json({ message: 'PlayerSelection not found' });
  if (!selection.isFrozen) return res.status(409).json({ message: 'PlayerSelection must be frozen' });

  // Always force rebuild in minimal mode
  pointsBySessionId.delete(String(sessionId));

  const userPlayers = Array.isArray(selection.userPlayers) && selection.userPlayers.length > 0
    ? selection.userPlayers
    : Array.isArray(selection.selectedPlayers)
      ? selection.selectedPlayers
      : [];
  const friendPlayers = Array.isArray(selection.friendPlayers) ? selection.friendPlayers : [];

  const docs = [
    ...userPlayers.map((playerId) => ({
      _id: `dev-points-${String(sessionId)}-USER-${String(playerId)}`,
      sessionId,
      team: 'USER',
      playerId,
      totalPoints: 0,
      ruleWiseBreakdown: {},
    })),
    ...friendPlayers.map((playerId) => ({
      _id: `dev-points-${String(sessionId)}-FRIEND-${String(playerId)}`,
      sessionId,
      team: 'FRIEND',
      playerId,
      totalPoints: 0,
      ruleWiseBreakdown: {},
    })),
  ];

  pointsBySessionId.set(String(sessionId), docs);
  return res.status(200).json({
    message: 'Stats refreshed and points recalculated',
    statsUpdated: 0,
    sourceUrl: null,
    playerWisePoints: docs,
    userTotalPoints: 0,
    friendTotalPoints: 0,
    totalPoints: 0,
  });
});

// Cricbuzz endpoints (mirror main app routes)
app.get('/api/cricket/matches', async (req, res) => {
  try {
    console.log('[API] GET /api/cricket/matches - Fetching live/today matches...');
    const matches = await scrapeTodayAndLiveMatches();
    console.log(`[API] Returning ${matches.length} today/live matches`);
    res.status(200).json(matches || []);
  } catch (error) {
    console.error('[API] Error fetching cricket matches:', error.message);
    res.status(502).json({ message: error.message || 'Failed to fetch matches' });
  }
});

app.get('/api/cricket/matches/upcoming', async (req, res) => {
  try {
    console.log('[API] GET /api/cricket/matches/upcoming - Fetching upcoming matches...');
    const matches = await scrapeUpcomingMatches();
    console.log(`[API] Returning ${matches.length} upcoming matches`);
    res.status(200).json(matches || []);
  } catch (error) {
    console.error('[API] Error fetching upcoming cricket matches:', error.message);
    res.status(502).json({ message: error.message || 'Failed to fetch upcoming matches' });
  }
});

app.get('/api/cricket/matches/:matchId/squads', async (req, res) => {
  try {
    const { matchId } = req.params;
    const data = await scrapeMatchSquadsAndPlayingXI(matchId);
    if (!data) return res.status(502).json({ message: 'Failed to fetch match squads' });
    return res.status(200).json(data);
  } catch (error) {
    console.error('[API] Error fetching squads:', error.message);
    return res.status(502).json({ message: error.message || 'Failed to fetch squads' });
  }
});

app.listen(PORT, () => {
  console.log(`Minimal test server running on port ${PORT}`);
});

// Unhandled error handlers
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED]', reason);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED]', reason);
});
