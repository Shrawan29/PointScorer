import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import RuleSet from '../models/RuleSet.model.js';

export const createRuleSet = async (req, res, next) => {
	try {
		const { friendId, rulesetName, rules } = req.body;

		if (!friendId || !rulesetName || !rules) {
			return res
				.status(400)
				.json({ message: 'friendId, rulesetName, and rules are required' });
		}

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		const friend = await Friend.findOne({ _id: friendId, userId: req.userId });
		if (!friend) {
			return res.status(404).json({ message: 'Friend not found' });
		}

		const ruleset = await RuleSet.create({
			userId: req.userId,
			friendId,
			rulesetName,
			rules,
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
		if (typeof rules !== 'undefined') updates.rules = rules;

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

export default {
	createRuleSet,
	getRuleSetsByFriend,
	getRuleSetById,
	updateRuleSet,
	deleteRuleSet,
};
