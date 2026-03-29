import mongoose from 'mongoose';

const passwordResetRequestSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		status: {
			type: String,
			enum: ['PENDING', 'COMPLETED', 'REJECTED'],
			default: 'PENDING',
		},
		requestedAt: {
			type: Date,
			default: Date.now,
		},
		requestedByIp: {
			type: String,
			default: null,
		},
		requestedUserAgent: {
			type: String,
			default: null,
		},
		resolvedAt: {
			type: Date,
			default: null,
		},
		resolvedByAdminId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		resolutionNote: {
			type: String,
			default: null,
			trim: true,
		},
	},
	{ timestamps: true }
);

passwordResetRequestSchema.index(
	{ userId: 1, status: 1 },
	{ unique: true, partialFilterExpression: { status: 'PENDING' } }
);

export default mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
