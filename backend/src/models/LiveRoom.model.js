import mongoose from 'mongoose';

const liveRoomSchema = new mongoose.Schema(
  {
    hostUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    guestUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    hostFriendId: {
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
      trim: true,
    },
    realMatchName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['LOBBY', 'DRAFTING', 'CAPTAIN', 'FROZEN', 'CANCELLED', 'EXPIRED'],
      default: 'LOBBY',
    },
    hostReady: {
      type: Boolean,
      default: false,
    },
    guestReady: {
      type: Boolean,
      default: false,
    },
    turnUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    hostPlayers: {
      type: [String],
      default: [],
    },
    guestPlayers: {
      type: [String],
      default: [],
    },
    hostCaptain: {
      type: String,
      default: null,
    },
    guestCaptain: {
      type: String,
      default: null,
    },
    captainRequired: {
      type: Boolean,
      default: false,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatchSession',
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    frozenAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

liveRoomSchema.index({ hostUserId: 1, guestUserId: 1, createdAt: -1 });
liveRoomSchema.index({ status: 1, expiresAt: 1 });
liveRoomSchema.index(
  { hostUserId: 1, guestUserId: 1, hostFriendId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['LOBBY', 'DRAFTING', 'CAPTAIN'] },
    },
  }
);

export default mongoose.model('LiveRoom', liveRoomSchema);
