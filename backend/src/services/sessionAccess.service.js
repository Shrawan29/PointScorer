import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';

const toAppError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const normalizeTeam = (value) => {
  const upper = String(value || 'USER').toUpperCase();
  return upper === 'FRIEND' ? 'FRIEND' : 'USER';
};

const readSelectionTeams = (selection) => {
  const userPlayers =
    Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
      ? selection.userPlayers
      : Array.isArray(selection?.selectedPlayers)
        ? selection.selectedPlayers
        : [];
  const friendPlayers = Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [];

  return {
    userPlayers,
    friendPlayers,
    userCaptain: selection?.userCaptain || selection?.captain || null,
    friendCaptain: selection?.friendCaptain || null,
  };
};

export const mapTeamForViewer = ({ team, viewerRole }) => {
  const normalized = normalizeTeam(team);
  if (String(viewerRole || '') !== 'GUEST') return normalized;
  return normalized === 'USER' ? 'FRIEND' : 'USER';
};

export const orientTotalsForViewer = ({ userTotalPoints, friendTotalPoints, viewerRole }) => {
  if (String(viewerRole || '') !== 'GUEST') {
    return {
      userTotalPoints,
      friendTotalPoints,
    };
  }

  return {
    userTotalPoints: friendTotalPoints,
    friendTotalPoints: userTotalPoints,
  };
};

export const orientBreakdownsForViewer = ({ rows, viewerRole }) => {
  const list = Array.isArray(rows) ? rows : [];
  if (String(viewerRole || '') !== 'GUEST') return list;

  return list.map((row) => ({
    ...(row || {}),
    team: mapTeamForViewer({ team: row?.team, viewerRole }),
  }));
};

export const orientSelectionForViewer = ({ selection, viewerRole }) => {
  const plain =
    selection && typeof selection.toObject === 'function'
      ? selection.toObject()
      : { ...(selection || {}) };
  const parsed = readSelectionTeams(plain);

  if (String(viewerRole || '') !== 'GUEST') {
    return {
      ...plain,
      ...parsed,
      selectedPlayers: parsed.userPlayers,
      captain: parsed.userCaptain || null,
    };
  }

  return {
    ...plain,
    userPlayers: parsed.friendPlayers,
    friendPlayers: parsed.userPlayers,
    userCaptain: parsed.friendCaptain,
    friendCaptain: parsed.userCaptain,
    selectedPlayers: parsed.friendPlayers,
    captain: parsed.friendCaptain || null,
  };
};

export const resolveSessionViewerAccess = async ({ sessionId, userId }) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw toAppError('Invalid sessionId', 400);
  }

  const session = await MatchSession.findById(sessionId).lean();
  if (!session) {
    throw toAppError('MatchSession not found', 404);
  }

  const friend = await Friend.findById(session.friendId).lean();
  if (!friend || String(friend.userId || '') !== String(session.userId || '')) {
    throw toAppError('Friend not found', 404);
  }

  const viewer = String(userId || '');
  const owner = String(session.userId || '');
  const linkedUser = String(friend.linkedUserId || '');

  if (viewer === owner) {
    return {
      viewerRole: 'HOST',
      ownerUserId: owner,
      viewerUserId: viewer,
      session,
      friend,
    };
  }

  if (linkedUser && viewer === linkedUser) {
    return {
      viewerRole: 'GUEST',
      ownerUserId: owner,
      viewerUserId: viewer,
      session,
      friend,
    };
  }

  throw toAppError('You do not have access to this session', 403);
};

export default {
  mapTeamForViewer,
  orientTotalsForViewer,
  orientBreakdownsForViewer,
  orientSelectionForViewer,
  resolveSessionViewerAccess,
};