import Friend from '../models/Friend.model.js';

export const createFriend = async (req, res, next) => {
  try {
    const { friendName } = req.body;

    // Validate input
    if (!friendName) {
      return res.status(400).json({ message: 'Friend name is required' });
    }

    // Create friend
    const friend = new Friend({
      userId: req.userId,
      friendName,
    });

    await friend.save();

    return res.status(201).json(friend);
  } catch (error) {
    next(error);
  }
};

export const getFriends = async (req, res, next) => {
  try {
    // Get all friends for logged-in user
    const friends = await Friend.find({ userId: req.userId });

    return res.status(200).json(friends);
  } catch (error) {
    next(error);
  }
};

export const deleteFriend = async (req, res, next) => {
  try {
    const { friendId } = req.params;

    // Find friend by id and verify ownership
    const friend = await Friend.findOne({
      _id: friendId,
      userId: req.userId,
    });

    if (!friend) {
      return res.status(404).json({ message: 'Friend not found' });
    }

    // Delete friend
    await Friend.deleteOne({ _id: friendId });

    return res.status(200).json({ message: 'Friend deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export default { createFriend, getFriends, deleteFriend };
