import mongoose from 'mongoose';

const matchHistorySchema = new mongoose.Schema(
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
    matchId: {
      type: String,
      required: true,
    },
    matchName: {
      type: String,
      required: true,
    },
    playedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index to ensure a user can play a specific match with a specific friend only once
matchHistorySchema.index({ userId: 1, friendId: 1, matchId: 1 }, { unique: true });

export default mongoose.model('MatchHistory', matchHistorySchema);
