import mongoose from 'mongoose';

const rawPlayerStatsSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchSession',
      required: true,
    },
    playerId: {
      type: String,
      required: true,
    },
    runs: Number,
    fours: Number,
    sixes: Number,
    wickets: Number,
    catches: Number,
    runouts: Number,
  },
  { timestamps: true }
);

export default mongoose.model('RawPlayerStats', rawPlayerStatsSchema);
