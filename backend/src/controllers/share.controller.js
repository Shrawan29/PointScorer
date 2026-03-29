import mongoose from 'mongoose';
import crypto from 'crypto';

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

export const getFriendViewerLink = async (req, res, next) => {
	try {
		const { friendId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		const friend = await Friend.findOne({ _id: friendId, userId: req.userId });
		if (!friend) {
			return res.status(404).json({ message: 'Friend not found' });
		}

		if (!friend.friendViewToken) {
			friend.friendViewToken = crypto.randomBytes(24).toString('hex');
			await friend.save();
		}

		const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
			.split(',')[0]
			.trim();
		const host = String(req.headers['x-forwarded-host'] || req.get('host') || '')
			.split(',')[0]
			.trim();

		const originHeader = String(req.headers.origin || '').trim();
		const originBase = /^https?:\/\//i.test(originHeader)
			? originHeader.replace(/\/$/, '')
			: '';

		const refererHeader = String(req.headers.referer || '').trim();
		let refererBase = '';
		if (refererHeader) {
			try {
				refererBase = new URL(refererHeader).origin;
			} catch (_err) {
				refererBase = '';
			}
		}

		const configuredFrontendBase =
			typeof process.env.FRONTEND_BASE_URL === 'string'
				? process.env.FRONTEND_BASE_URL.trim().replace(/\/$/, '')
				: '';

		const inferredBase = host ? `${proto}://${host}` : '';
		const baseUrl = configuredFrontendBase || originBase || refererBase || inferredBase;
		const path = `/friend-view/${friend.friendViewToken}`;

		return res.status(200).json({
			friendId: String(friend._id),
			friendName: friend.friendName,
			token: friend.friendViewToken,
			path,
			url: baseUrl ? `${baseUrl}${path}` : path,
		});
	} catch (error) {
		next(error);
	}
};

export default {
	getWhatsAppShareText,
	getWhatsAppBreakdownShareText,
	getFriendViewerLink,
};
