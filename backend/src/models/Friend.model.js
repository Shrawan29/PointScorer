import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    friendName: {
      type: String,
      required: true,
      trim: true,
    },
    friendViewToken: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    liveInviteToken: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    liveInviteExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Friend', friendSchema);
