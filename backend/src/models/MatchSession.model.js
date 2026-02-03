import mongoose from 'mongoose';

const matchSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Friend',
      required: true,
    },
    rulesetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RuleSet',
      required: true,
    },
    realMatchId: {
      type: String,
      required: true,
    },
    realMatchName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['UPCOMING', 'LIVE', 'COMPLETED'],
      default: 'UPCOMING',
    },
    playedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('MatchSession', matchSessionSchema);
