import mongoose from 'mongoose';

const playerSelectionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchSession',
      required: true,
    },
    // Backward-compatible fields (treated as the user's team)
    selectedPlayers: {
      type: [String],
      default: [],
    },
    captain: {
      type: String,
      default: null,
    },

    // New: explicit teams
    userPlayers: {
      type: [String],
      default: [],
    },
    userCaptain: {
      type: String,
      default: null,
    },
    friendPlayers: {
      type: [String],
      default: [],
    },
    friendCaptain: {
      type: String,
      default: null,
    },
    isFrozen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model('PlayerSelection', playerSelectionSchema);
