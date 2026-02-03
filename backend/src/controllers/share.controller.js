import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RuleSet from '../models/RuleSet.model.js';
import User from '../models/User.model.js';
import { formatWhatsAppBreakdownShareText, formatWhatsAppShareText } from '../utils/whatsappFormatter.js';
import { buildDetailedBreakdownForSessionId } from '../services/breakdown.service.js';

export const getWhatsAppShareText = async (req, res, next) => {
	try {
		const { sessionId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}
		if (session.status !== 'COMPLETED') {
			return res.status(409).json({ message: 'MatchSession is not COMPLETED' });
		}

		const [friend, ruleset, selection, breakdowns, user] = await Promise.all([
			Friend.findOne({ _id: session.friendId, userId: req.userId }).lean(),
			RuleSet.findOne({ _id: session.rulesetId, userId: req.userId }).lean(),
			PlayerSelection.findOne({ sessionId }).lean(),
			PointsBreakdown.find({ sessionId }).lean(),
			User.findOne({ _id: req.userId }).lean(),
		]);

		if (!friend) {
			return res.status(404).json({ message: 'Friend not found' });
		}
		if (!ruleset) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}
		if (!selection) {
			return res.status(404).json({ message: 'PlayerSelection not found' });
		}
		if (!breakdowns || breakdowns.length === 0) {
			return res.status(404).json({ message: 'PointsBreakdown not found for this session' });
		}

		const text = formatWhatsAppShareText({
			matchSession: session,
			userName: user?.name || user?.email || null,
			friendName: friend.friendName,
			rulesetName: ruleset.rulesetName,
			playerSelections: selection,
			pointsBreakdowns: breakdowns,
		});

		return res.status(200).json({ text });
	} catch (error) {
		next(error);
	}
};

export const getWhatsAppBreakdownShareText = async (req, res, next) => {
	try {
		const { sessionId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const [friend, ruleset, selection] = await Promise.all([
			Friend.findOne({ _id: session.friendId, userId: req.userId }).lean(),
			RuleSet.findOne({ _id: session.rulesetId, userId: req.userId }).lean(),
			PlayerSelection.findOne({ sessionId }).lean(),
		]);
		const user = await User.findOne({ _id: req.userId }).lean();

		if (!friend) {
			return res.status(404).json({ message: 'Friend not found' });
		}
		if (!ruleset) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}
		if (!selection) {
			return res.status(404).json({ message: 'PlayerSelection not found' });
		}
		if (!selection.isFrozen) {
			return res.status(409).json({ message: 'PlayerSelection must be frozen' });
		}

		const breakdown = await buildDetailedBreakdownForSessionId({ sessionId, userId: req.userId });
		const text = formatWhatsAppBreakdownShareText({
			matchSession: session,
			userName: user?.name || user?.email || null,
			friendName: friend.friendName,
			rulesetName: ruleset.rulesetName,
			playerSelections: selection,
			breakdown,
		});

		return res.status(200).json({ text });
	} catch (error) {
		next(error);
	}
};

export default {
	getWhatsAppShareText,
	getWhatsAppBreakdownShareText,
};
