# 🚀 QUICK START - 5 MINUTES

TL;DR - Get PointScorer running with the new features in 5 minutes.

---

## What's New?

✨ **7 Major Features Implemented:**
1. ✅ Admin Dashboard - Manage all users
2. ✅ Create Users - Only admins authorize access
3. ✅ Friend Limits - Control per user
4. ✅ Block Users - Prevent login instantly
5. ✅ No Replay - Play each match once per friend
6. ✅ Rule Templates - Reusable scoring rules
7. ✅ Team Groups - Players grouped by team

---

## 1. Get the Code (1 min)

```bash
# Already have it? Great!
# Make sure you're on the latest commit
git pull
```

---

## 2. Set Up Database (2 min)

### Using MongoDB Shell
```javascript
// Copy-paste into MongoDB shell:

// Add fields to existing users
db.users.updateMany({}, {
  $set: { isAdmin: false, isBlocked: false, maxFriendsAllowed: 10 }
})

// Create MatchHistory index
db.matchhistories.createIndex({
  userId: 1, friendId: 1, matchId: 1
}, { unique: true })

// Done!
```

### Fresh Database?
- Models auto-create on startup ✅

---

## 3. Create Admin User (1 min)

### Option A: MongoDB Shell
```javascript
db.users.insertOne({
  name: "Admin",
  email: "admin@example.com",
  password: "$2b$10$IMPORTANT_USE_HASHED_PASSWORD_HERE",
  isAdmin: true,
  isBlocked: false,
  maxFriendsAllowed: 50,
  activeSessionId: null,
  activeSessionExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

⚠️ Need bcrypt hash? Use Node.js:
```javascript
const bcrypt = require('bcrypt');
bcrypt.hash('password123', 10).then(hash => console.log(hash));
```

### Option B: Use API (after server starts)
```bash
curl -X POST http://localhost:5000/api/admin/users/create \
  -H "Authorization: Bearer <existing_admin_token>" \
  -H "Content-Type: application/json" \
  -d {
    "name": "Admin",
    "email": "admin@example.com",
    "password": "change123after",
    "maxFriendsAllowed": 50
  }
```

---

## 4. Start Services (1 min)

### Backend
```bash
cd backend
npm install
npm start
# Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens on http://localhost:5173
```

---

## 5. Test It! (works immediately)

### Login as Admin
1. Open browser: http://localhost:3000
2. Click "Login"
3. Email: `admin@example.com`
4. Password: `change123after` (or your set password)

### View Admin Dashboard
1. After login, click "Admin" in navigation
2. You should see:
   - User list
   - Create user form
   - Block/unblock buttons
   - Friend limit editor

### Try Features
```bash
# Via API - Create regular user
curl -X POST http://localhost:5000/api/admin/users/create \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d {
    "name": "Player One",
    "email": "player1@example.com",
    "password": "secure123",
    "maxFriendsAllowed": 10
  }

# Get all users
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer <admin_token>"
```

---

## Common Tasks

### Create Regular User
**Via Admin Dashboard:**
1. Click "Admin" → "+ Create User"
2. Fill form with email & password
3. Click "Create User"
4. Done! ✅

### Block a User
**Via Admin Dashboard:**
1. Find user in table
2. Click "Block" button
3. User cannot login now ✅

### Increase Friend Limit
**Via Admin Dashboard:**
1. Click on friend count number
2. Enter new limit
3. Save ✅

### Test Match Replay Prevention
1. Login as regular user
2. Add a friend
3. Create match session (Fill form & click create)
4. Try creating same match with same friend
5. See error: "Already played this match" ✅

### Create Rule Template
1. Click "Dashboard"
2. Scroll down to "Scoring Rules"
3. Click "Create Rule Template"
4. Fill form with rules
5. Check "Create as reusable template"
6. Click Create ✅

---

## 📋 Quick Reference

| Want to... | Go to... |
|-----------|----------|
| Manage users | `/admin` |
| Create user | Admin Dashboard → Create User |
| Block user | Admin Dashboard → Block button |
| Set friend limit | Admin Dashboard → Click count |
| Create template | Dashboard → Create Rule Template |
| Play match | Dashboard → Select friend → Match |
| See team grouping | Match → Player selection |

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| 403 on /admin | User not admin (check DB) |
| Friend limit error | Admin increase limit in dashboard |
| Cannot create match | Already played (check MatchHistory) |
| Team grouping missing | Teams not in API response |
| Blocked user can login | Cache (restart server & browser) |

---

## 📁 Key Files

```
backend/
├── controllers/admin.controller.js ← Admin operations
├── models/MatchHistory.model.js ← Play tracking
└── routes/admin.routes.js ← Admin endpoints

frontend/
└── pages/AdminDashboard.jsx ← Admin UI
```

---

## 📚 Full Documentation

Need more info?

| Document | Purpose |
|----------|---------|
| README_IMPLEMENTATION.md | What's new |
| DEPLOYMENT_GUIDE.md | How to deploy |
| FEATURES_IMPLEMENTATION.md | All details |
| VERIFICATION_CHECKLIST.md | Testing |

---

## ✅ Success Checklist

- [ ] Database migrated
- [ ] Admin user created
- [ ] Backend running
- [ ] Frontend running
- [ ] Can login as admin
- [ ] Admin dashboard loads
- [ ] Can create user
- [ ] Can block user
- [ ] Can set friend limit
- [ ] Can create template
- [ ] Match replay prevented
- [ ] Team grouping shows

All ✅? **You're ready to go!** 🎉

---

## 🚀 Deploy to Production

See **DEPLOYMENT_GUIDE.md** for full production deployment.

Quick prod checklist:
- [ ] Change admin password
- [ ] Set JWT_SECRET in .env
- [ ] Set MONGODB_URI correctly
- [ ] Enable HTTPS
- [ ] Configure CORS_ORIGIN
- [ ] Set NODE_ENV=production
- [ ] Test all features
- [ ] Setup monitoring
- [ ] Plan rollback

---

## 📞 Need Help?

1. Check **DOCUMENTATION_INDEX.md** to find the right doc
2. Search specific feature in **FEATURES_IMPLEMENTATION.md**
3. Troubleshoot with **DEPLOYMENT_GUIDE.md**

---

**Everything ready? Login and test the admin dashboard!** ✨

