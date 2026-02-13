# PointScorer - Major Features Implementation Guide

This document outlines all the major features implemented in this release.

## Features Implemented

### 1. Admin Dashboard & User Management

#### Admin Features:
- **Create Users**: Only admins can create user accounts with ID and password
- **Manage Users**: View all users in the system
- **Block/Unblock Users**: Admin can stop users from logging in
- **Control Friend Limits**: Admin can set how many friends each user can create
- **Delete Users**: Remove users from the system

#### Backend Implementation:
- **Model Updates**: Added `isAdmin`, `isBlocked`, and `maxFriendsAllowed` fields to User model
- **Admin Controller** (`backend/src/controllers/admin.controller.js`):
  - `checkAdmin()` - Middleware to verify admin status
  - `getAllUsers()` - Fetch all users (paginated)
  - `createUser()` - Create new user
  - `updateUser()` - Update user settings
  - `toggleUserBlock()` - Block/unblock user
  - `deleteUser()` - Delete user

- **Admin Routes** (`backend/src/routes/admin.routes.js`):
  - Protected routes requiring authentication and admin status
  - Endpoints: `/api/admin/users/*`

#### Frontend Implementation:
- **AdminDashboard.jsx** - New admin interface with:
  - User creation form
  - User list with status indicators
  - Block/unblock actions
  - Max friends control
  - Delete functionality
  - Admin route at `/admin`

#### Login Blocking:
- Modified auth controller to reject login for blocked users
- Block status checked during login attempt

---

### 2. Match-Friend Play Restriction

#### Feature:
- A user can play a specific match with a specific friend **only once**
- After playing, attempting to create another session with same friend for same match returns error
- User can play the same match with different friends

#### Implementation:
- **MatchHistory Model** (`backend/src/models/MatchHistory.model.js`):
  - Tracks user-friend-match combinations
  - Compound unique index on `(userId, friendId, matchId)`

- **Match Controller** - `createMatchSession()`:
  - Validates no existing entry in MatchHistory
  - Returns 400 error with descriptive message if match already played

- **Scoring Controller** - `calculatePointsForSession()`:
  - Auto-records match in MatchHistory after scoring is calculated
  - Prevents future play with same friend

---

### 3. Friend Creation Max Limit Control

#### Feature:
- Admin can set maximum number of friends each user can create
- Default: 10 friends per user
- Users see error when trying to exceed limit

#### Implementation:
- **User Model**: `maxFriendsAllowed` field (default: 10)
- **Friend Controller** - `createFriend()`:
  - Counts existing friends
  - Checks against user's `maxFriendsAllowed`
  - Returns 400 error with friendly message if limit reached
- **Admin Dashboard**: Click on max friends count to update per user

---

### 4. Custom RuleSet Templates

#### Feature:
- Users can create reusable ruleset **templates**
- Templates can be applied to new friend-specific rulesets
- Non-template rulesets are friend-specific (existing behavior)
- Users can create rule templates without selecting a friend first

#### Implementation:
- **RuleSet Model Updates**:
  - Added `isTemplate` boolean field
  - Added `description` field for templates
  - `friendId` now optional (required only for non-templates)

- **RuleSet Controller**:
  - `createRuleSet()` - Now supports `isTemplate` flag
  - `getAllUserRuleSets()` - Fetch all rulesets for user
  - `getRuleSetTemplates()` - Fetch templates only

- **Frontend Changes**:
  - RulesetCreatePage now has template checkbox
  - Can create templates from dashboard
  - Route: `/rulesets/new-template` for new templates

---

### 5. Player Selection by Team

#### Feature:
- Players are now grouped by team name when selecting players
- Team headers show the team name
- Players are listed under their respective teams
- Search filters across all teams
- Visual separation makes team composition clear

#### Implementation:
- **Backend**: Cricket API provides squad data with team structure
- **Frontend** - PlayerSelectionPage:
  - `playersByTeam` - Groups players by team
  - `filteredPlayersByTeam` - Filters while maintaining team grouping
  - Renders team headers with sticky positioning
  - Visual styling distinguishes team sections

#### UI Enhancements:
- Team name as sticky header with gray background
- Player list under each team
- Hover effects for better UX
- Search works across all teams

---

### 6. User-Specific Admin Controls

#### Admin Can:
- **Create users** with custom friend limits
- **View all users** with their status
- **Modify max friends** - Click on friend count to change
- **Block/Unblock users** - Toggle access
- **Delete users** - Complete removal

#### User Experience:
- Admin dashboard accessible via `/admin` route
- Only visible to admin users in navigation
- Real-time feedback with success/error alerts
- User creation form with validation
- Inline editing for quick updates

---

## API Endpoints

### Admin Endpoints (Protected - Admin Only)
```
GET    /api/admin/users               - Get all users
POST   /api/admin/users/create        - Create new user
GET    /api/admin/users/:userId       - Get user details
PUT    /api/admin/users/:userId       - Update user settings
PATCH  /api/admin/users/:userId/toggle-block - Block/unblock user
DELETE /api/admin/users/:userId       - Delete user
```

### RuleSet Endpoints (Updated)
```
GET    /api/rulesets/templates        - Get all user templates
GET    /api/rulesets                  - Get all user rulesets
POST   /api/rulesets                  - Create ruleset/template
```

### Match Endpoints (Updated)
```
POST   /api/matches/sessions          - Create match session
  - Now checks MatchHistory for conflicts
```

### Friend Endpoints (Updated)
```
POST   /api/friends                   - Create friend
  - Now validates max friends limit
```

---

## Database Schema Changes

### User Model
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  activeSessionId: String,
  activeSessionExpiresAt: Date,
  isAdmin: Boolean (default: false),        // NEW
  isBlocked: Boolean (default: false),      // NEW
  maxFriendsAllowed: Number (default: 10),  // NEW
  createdAt: Date,
  updatedAt: Date
}
```

### MatchHistory Model (NEW)
```javascript
{
  userId: ObjectId,
  friendId: ObjectId,
  matchId: String,
  matchName: String,
  playedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
// Compound unique index: (userId, friendId, matchId)
```

### RuleSet Model
```javascript
{
  userId: ObjectId,
  friendId: ObjectId (optional),
  rulesetName: String,
  description: String,               // NEW
  isTemplate: Boolean (default: false), // NEW
  rules: [Rule],
  createdAt: Date,
  updatedAt: Date
}
```

---

## Frontend Routes

### New Routes
- `/admin` - Admin Dashboard (admin only)
- `/rulesets/new-template` - Create ruleset template

### Updated Routes
- Dashboard now shows "Create Rule Template" button
- Layout navigation shows "Admin" link for admins

---

## Environment & Setup

### Requirements
- Node.js (v14+)
- MongoDB
- bcrypt for password hashing
- JWT for auth tokens

### Installation Steps
1. Install backend dependencies: `npm install` in `backend/`
2. Install frontend dependencies: `npm install` in `frontend/`
3. Configure `.env` with:
   - `MONGODB_URI` - Connection string
   - `JWT_SECRET` - Secret key
   - `JWT_EXPIRES_IN` - Token expiry (default: 7d)

### Initialize Data
To create an initial admin user:
```javascript
const user = new User({
  name: 'Admin',
  email: 'admin@example.com',
  password: await bcrypt.hash('password123', 10),
  isAdmin: true,
  maxFriendsAllowed: 50
});
await user.save();
```

---

## Testing Checklist

- [ ] Admin can create users
- [ ] Admin can view all users
- [ ] Admin can block/unblock users
- [ ] Admin can modify max friend limits
- [ ] Blocked users cannot login
- [ ] User hitting friend limit sees error
- [ ] User cannot play same match twice with same friend
- [ ] Can create ruleset templates
- [ ] Players display grouped by team
- [ ] Search filters across teams
- [ ] Admin link shows in navigation for admins
- [ ] Non-admins cannot access admin routes

---

## Error Handling

### User Friendly Error Messages
- "You have reached the maximum number of friends (X). Please contact admin to increase the limit."
- "You have already played this match (IND vs ENG) with this friend. You can only play each match with the same friend once."
- "Your account has been blocked by admin. Please contact support."
- "Admin access required"

---

## Future Enhancements

1. **Bulk user creation** - CSV import
2. **User statistics dashboard** - For admins
3. **Audit logs** - Track admin actions
4. **Schedule matches** - Admin can schedule matches
5. **Templates marketplace** - Share templates between users
6. **Rule presets** - Pre-built rule configurations
7. **Leaderboards** - Across all users

---

## Commit Message

```
feat: implement major admin and gameplay features

- Add admin dashboard for user management
- Implement block/unblock user functionality
- Add max friend limit control per user
- Prevent repeated match play with same friend
- Support custom ruleset templates
- Group players by team in selection UI
- Enhance friend creation with limit validation
- Add MatchHistory model for tracking
- Update auth to check blocked status
```

