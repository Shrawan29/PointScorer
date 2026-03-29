import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
  },
  { timestamps: true }
);

export default mongoose.model('Friend', friendSchema);
