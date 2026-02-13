import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import RuleSet from '../models/RuleSet.model.js';

const CAPTAIN_MULTIPLIER = 2;

const sanitizeRules = (rules) => {
	const arr = Array.isArray(rules) ? rules : [];
	const out = [];
	let captainSeen = false;

	for (const r of arr) {
		if (!r || typeof r !== 'object') continue;
		const event = String(r.event || '').trim();
		if (!event) continue;

		if (event === 'captainMultiplier') {
			if (captainSeen) continue;
			captainSeen = true;
			out.push({
				event: 'captainMultiplier',
				points: 0,
				multiplier: CAPTAIN_MULTIPLIER,
				enabled: r.enabled !== false,
			});
			continue;
		}

		const points = Number(r.points);
		const multiplier = Number(r.multiplier);
		out.push({
			event,
			points: Number.isFinite(points) ? points : 0,
			multiplier: Number.isFinite(multiplier) ? multiplier : 1,
			enabled: r.enabled !== false,
		});
	}

	return out;
};

export const createRuleSet = async (req, res, next) => {
	try {
		const { friendId, rulesetName, rules, isTemplate = false, description = '' } = req.body;

		// Validate required fields
		if (!rulesetName || !rules) {
			return res
				.status(400)
				.json({ message: 'rulesetName and rules are required' });
		}

		// If not a template, friendId is required
		if (!isTemplate && !friendId) {
			return res
				.status(400)
				.json({ message: 'friendId is required for non-template rulesets' });
		}

		if (friendId && !mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		// Verify friend ownership if friendId is provided
		if (friendId) {
			const friend = await Friend.findOne({ _id: friendId, userId: req.userId });
			if (!friend) {
				return res.status(404).json({ message: 'Friend not found' });
			}
		}

		const ruleset = await RuleSet.create({
			userId: req.userId,
			friendId: friendId || null,
			rulesetName,
			rules: sanitizeRules(rules),
			isTemplate,
			description,
		});

		return res.status(201).json(ruleset);
	} catch (error) {
		next(error);
	}
};

export const getRuleSetsByFriend = async (req, res, next) => {
	try {
		const { friendId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		const ruleSets = await RuleSet.find({
			userId: req.userId,
			friendId,
		}).sort({ createdAt: -1 });

		return res.status(200).json(ruleSets);
	} catch (error) {
		next(error);
	}
};

export const getRuleSetById = async (req, res, next) => {
	try {
		const { rulesetId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		const ruleset = await RuleSet.findOne({ _id: rulesetId, userId: req.userId });
		if (!ruleset) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}

		return res.status(200).json(ruleset);
	} catch (error) {
		next(error);
	}
};

export const updateRuleSet = async (req, res, next) => {
	try {
		const { rulesetId } = req.params;
		const { rulesetName, rules } = req.body;

		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		const updates = {};
		if (typeof rulesetName !== 'undefined') updates.rulesetName = rulesetName;
		if (typeof rules !== 'undefined') updates.rules = sanitizeRules(rules);

		if (Object.keys(updates).length === 0) {
			return res
				.status(400)
				.json({ message: 'Nothing to update (rulesetName or rules)' });
		}

		const updated = await RuleSet.findOneAndUpdate(
			{ _id: rulesetId, userId: req.userId },
			{ $set: updates },
			{ new: true, runValidators: true }
		);

		if (!updated) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}

		return res.status(200).json(updated);
	} catch (error) {
		next(error);
	}
};

export const deleteRuleSet = async (req, res, next) => {
	try {
		const { rulesetId } = req.params;

		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		const deleted = await RuleSet.findOneAndDelete({ _id: rulesetId, userId: req.userId });
		if (!deleted) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}

		return res.status(200).json({ message: 'RuleSet deleted successfully' });
	} catch (error) {
		next(error);
	}
};

export const getAllUserRuleSets = async (req, res, next) => {
	try {
		const ruleSets = await RuleSet.find({ userId: req.userId }).sort({ createdAt: -1 });
		return res.status(200).json(ruleSets);
	} catch (error) {
		next(error);
	}
};

export const getRuleSetTemplates = async (req, res, next) => {
	try {
		const templates = await RuleSet.find({
			userId: req.userId,
			isTemplate: true,
		}).sort({ createdAt: -1 });
		return res.status(200).json(templates);
	} catch (error) {
		next(error);
	}
};

export default {
	createRuleSet,
	getRuleSetsByFriend,
	getRuleSetById,
	updateRuleSet,
	deleteRuleSet,
	getAllUserRuleSets,
	getRuleSetTemplates,
};
