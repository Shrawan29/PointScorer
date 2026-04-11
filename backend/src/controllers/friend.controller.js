import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import User from '../models/User.model.js';
import { buildLiveInviteUrls, createOrRefreshFriendInvite } from '../services/friendInvite.service.js';

const userDisplayName = (user) => user?.name || user?.email || 'User';

const ensureCanManageFriends = (user) => {
  if (!user) return { ok: false, code: 404, message: 'User not found' };
  if (user.canManageFriends === false) {
    return {
      ok: false,
      code: 403,
      message: 'Your account cannot create or modify friends',
    };
  }
  return { ok: true };
};

export const createFriend = async (req, res, next) => {
  try {
    const { friendName } = req.body;

    // Validate input
    if (!friendName) {
      return res.status(400).json({ message: 'Friend name is required' });
    }

    // Get user to check max friends allowed
    const user = await User.findById(req.userId);
    const permission = ensureCanManageFriends(user);
    if (!permission.ok) {
      return res.status(permission.code).json({ message: permission.message });
    }

    // Count existing friends
    const friendCount = await Friend.countDocuments({ userId: req.userId });
    if (friendCount >= user.maxFriendsAllowed) {
      return res.status(400).json({
        message: `You have reached the maximum number of friends (${user.maxFriendsAllowed}). Please contact admin to increase the limit.`,
      });
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
    const [ownedFriends, guestLinkedRows] = await Promise.all([
      Friend.find({ userId: req.userId }).lean(),
      Friend.find({ linkedUserId: req.userId }).lean(),
    ]);

    const hostUserIds = Array.from(
      new Set(guestLinkedRows.map((row) => String(row?.userId || '')).filter(Boolean))
    );

    const hosts = hostUserIds.length
      ? await User.find({ _id: { $in: hostUserIds } }).select('name email').lean()
      : [];
    const hostById = new Map(hosts.map((host) => [String(host._id), host]));

    const hostRows = ownedFriends.map((row) => ({
      ...row,
      relationType: 'HOST_VIEW',
      hostDisplayName: null,
      canDelete: true,
    }));

    const guestRows = guestLinkedRows.map((row) => {
      const host = hostById.get(String(row?.userId || '')) || null;
      return {
        ...row,
        relationType: 'GUEST_VIEW',
        hostDisplayName: userDisplayName(host),
        canDelete: false,
      };
    });

    const mergedById = new Map();
    for (const row of guestRows) {
      mergedById.set(String(row?._id || ''), row);
    }
    // Host-owned rows win if the same friend doc appears in both collections.
    for (const row of hostRows) {
      mergedById.set(String(row?._id || ''), row);
    }

    const friends = Array.from(mergedById.values()).sort((a, b) => {
      const left = String(a?.friendName || '').toLowerCase();
      const right = String(b?.friendName || '').toLowerCase();
      return left.localeCompare(right);
    });

    return res.status(200).json(friends);
  } catch (error) {
    next(error);
  }
};

export const deleteFriend = async (req, res, next) => {
  try {
    const { friendId } = req.params;

    const user = await User.findById(req.userId).select('canManageFriends').lean();
    const permission = ensureCanManageFriends(user);
    if (!permission.ok) {
      return res.status(permission.code).json({ message: permission.message });
    }

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

export const createFriendInviteLink = async (req, res, next) => {
  try {
    const { friendId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: 'Invalid friendId' });
    }

    const user = await User.findById(req.userId).select('canManageFriends').lean();
    const permission = ensureCanManageFriends(user);
    if (!permission.ok) {
      return res.status(permission.code).json({ message: permission.message });
    }

    const friend = await createOrRefreshFriendInvite({
      friendId,
      hostUserId: req.userId,
    });

    const urls = buildLiveInviteUrls({ req, token: friend.liveInviteToken });

    return res.status(200).json({
      friendId: String(friend._id),
      friendName: friend.friendName,
      expiresAt: friend.liveInviteExpiresAt,
      ...urls,
    });
  } catch (error) {
    next(error);
  }
};

export default { createFriend, getFriends, deleteFriend, createFriendInviteLink };
