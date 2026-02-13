import mongoose from 'mongoose';

const ruleSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
      default: 0,
    },
    multiplier: {
      type: Number,
      default: 1,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const ruleSetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Friend',
      required: function() {
        return !this.isTemplate; // Only required if not a template
      },
    },
    rulesetName: {
      type: String,
      required: true,
    },
    rules: [ruleSchema],
    isTemplate: {
      type: Boolean,
      default: false, // false = friend-specific, true = reusable template
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model('RuleSet', ruleSetSchema);
