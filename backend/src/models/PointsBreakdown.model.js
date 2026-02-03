import mongoose from 'mongoose';

const pointsBreakdownSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchSession',
      required: true,
    },
    team: {
      type: String,
      enum: ['USER', 'FRIEND'],
      default: 'USER',
    },
    playerId: {
      type: String,
      required: true,
    },
    totalPoints: {
      type: Number,
      required: true,
    },
    ruleWiseBreakdown: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('PointsBreakdown', pointsBreakdownSchema);
