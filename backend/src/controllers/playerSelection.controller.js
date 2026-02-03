import mongoose from 'mongoose';

import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';

export const createOrUpdateSelection = async (req, res, next) => {
  try {
    const {
      sessionId,
      // legacy
      selectedPlayers,
      captain,
      // new
      userPlayers,
      userCaptain,
      friendPlayers,
      friendCaptain,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId' });
    }

    const safeUserPlayers = Array.isArray(userPlayers)
      ? userPlayers
      : Array.isArray(selectedPlayers)
        ? selectedPlayers
        : [];
    const safeFriendPlayers = Array.isArray(friendPlayers) ? friendPlayers : [];

    const safeUserCaptain = userCaptain ?? captain ?? null;
    const safeFriendCaptain = friendCaptain ?? null;

    if (safeUserPlayers.length === 0) {
      return res.status(400).json({ message: 'Select at least one player for your team' });
    }
    if (safeUserCaptain && !safeUserPlayers.includes(safeUserCaptain)) {
      return res.status(400).json({ message: 'Your captain must be one of your selected players' });
    }
    if (safeFriendCaptain && !safeFriendPlayers.includes(safeFriendCaptain)) {
      return res.status(400).json({ message: "Friend captain must be one of friend's selected players" });
    }

    const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'MatchSession not found' });
    }

    const existing = await PlayerSelection.findOne({ sessionId });

    if (existing) {
      if (existing.isFrozen) {
        return res.status(409).json({ message: 'Selection is frozen and cannot be updated' });
      }

      existing.userPlayers = safeUserPlayers;
      existing.userCaptain = safeUserCaptain;
      existing.friendPlayers = safeFriendPlayers;
      existing.friendCaptain = safeFriendCaptain;

      // Keep legacy fields in sync for existing scoring/share flows
      existing.selectedPlayers = safeUserPlayers;
      existing.captain = safeUserCaptain;
      await existing.save();

      return res.status(200).json(existing);
    }

    const created = await PlayerSelection.create({
      sessionId,
      userPlayers: safeUserPlayers,
      userCaptain: safeUserCaptain,
      friendPlayers: safeFriendPlayers,
      friendCaptain: safeFriendCaptain,

      // legacy
      selectedPlayers: safeUserPlayers,
      captain: safeUserCaptain,
      isFrozen: false,
    });

    return res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const freezeSelection = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId' });
    }

    const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'MatchSession not found' });
    }

    const frozen = await PlayerSelection.findOneAndUpdate(
      { sessionId, isFrozen: false },
      { $set: { isFrozen: true } },
      { new: true }
    );

    if (!frozen) {
      const exists = await PlayerSelection.findOne({ sessionId });
      if (!exists) {
        return res.status(404).json({ message: 'PlayerSelection not found' });
      }

      return res.status(409).json({ message: 'Selection is already frozen' });
    }

    return res.status(200).json(frozen);
  } catch (error) {
    next(error);
  }
};

export const getSelectionBySession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId' });
    }

    const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId });
    if (!session) {
      return res.status(404).json({ message: 'MatchSession not found' });
    }

    const selection = await PlayerSelection.findOne({ sessionId });
    if (!selection) {
      return res.status(404).json({ message: 'PlayerSelection not found' });
    }

	// Backfill new fields for older records (best-effort)
	if ((!selection.userPlayers || selection.userPlayers.length === 0) && Array.isArray(selection.selectedPlayers)) {
		selection.userPlayers = selection.selectedPlayers;
		selection.userCaptain = selection.userCaptain || selection.captain || null;
	}

    return res.status(200).json(selection);
  } catch (error) {
    next(error);
  }
};

export default {
  createOrUpdateSelection,
  freezeSelection,
  getSelectionBySession,
};
