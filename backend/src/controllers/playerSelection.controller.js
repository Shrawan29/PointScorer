import mongoose from 'mongoose';

import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import RuleSet from '../models/RuleSet.model.js';

const isCaptainMultiplierEnabled = (ruleSet) => {
  const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];
  const capRule = rules.find((r) => String(r?.event || '') === 'captainMultiplier');
  return Boolean(capRule && capRule.enabled !== false);
};

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

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		let captainEnabled = false;
		try {
			const ruleSet = await RuleSet.findOne({ _id: session.rulesetId, userId: req.userId }).lean();
			captainEnabled = isCaptainMultiplierEnabled(ruleSet);
		} catch {
			captainEnabled = false;
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

    const finalUserCaptain = captainEnabled ? safeUserCaptain : null;
    const finalFriendCaptain = captainEnabled ? safeFriendCaptain : null;

    if (captainEnabled) {
      if (!finalUserCaptain) {
        return res.status(400).json({ message: 'userCaptain is required for this ruleset' });
      }
      if (!finalFriendCaptain) {
        return res.status(400).json({ message: 'friendCaptain is required for this ruleset' });
      }
      if (!safeUserPlayers.includes(finalUserCaptain)) {
        return res.status(400).json({ message: 'Your captain must be one of your selected players' });
      }
      if (!safeFriendPlayers.includes(finalFriendCaptain)) {
        return res
          .status(400)
          .json({ message: "Friend captain must be one of friend's selected players" });
      }
    } else {
      // If the ruleset doesn't use captain multiplier, don't persist captains.
      // (This keeps result/share consistent and avoids confusing stale captains.)
    }

    const existing = await PlayerSelection.findOne({ sessionId });

    if (existing) {
      if (existing.isFrozen) {
        return res.status(409).json({ message: 'Selection is frozen and cannot be updated' });
      }

      existing.userPlayers = safeUserPlayers;
      existing.userCaptain = finalUserCaptain;
      existing.friendPlayers = safeFriendPlayers;
      existing.friendCaptain = finalFriendCaptain;

      // Keep legacy fields in sync for existing scoring/share flows
      existing.selectedPlayers = safeUserPlayers;
      existing.captain = finalUserCaptain;
      await existing.save();

      return res.status(200).json(existing);
    }

    const created = await PlayerSelection.create({
      sessionId,
      userPlayers: safeUserPlayers,
      userCaptain: finalUserCaptain,
      friendPlayers: safeFriendPlayers,
      friendCaptain: finalFriendCaptain,

      // legacy
      selectedPlayers: safeUserPlayers,
      captain: finalUserCaptain,
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
