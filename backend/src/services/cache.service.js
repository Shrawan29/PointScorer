import mongoose from 'mongoose';

const cacheSchema = new mongoose.Schema(
	{
		key: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		data: {
			type: mongoose.Schema.Types.Mixed,
			required: true,
		},
		createdAt: {
			type: Date,
			default: Date.now,
			required: true,
		},
	},
	{ versionKey: false }
);

const Cache = mongoose.models.Cache || mongoose.model('Cache', cacheSchema);

export const getCachedData = async (key) => {
	const doc = await Cache.findOne({ key }).lean();
	return doc ? doc.data : null;
};

export const setCachedData = async (key, data) => {
	await Cache.updateOne(
		{ key },
		{ $set: { key, data, createdAt: new Date() } },
		{ upsert: true }
	);
	return true;
};

export default { getCachedData, setCachedData };
