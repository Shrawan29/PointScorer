import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },

    // Single active session enforcement
    activeSessionId: {
      type: String,
      default: null,
    },
    activeSessionExpiresAt: {
      type: Date,
      default: null,
    },

    // Admin fields
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    maxFriendsAllowed: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
