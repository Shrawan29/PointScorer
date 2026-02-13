# Quick Setup & Deployment Guide

## Overview
All 7 major features have been implemented. This guide helps deploy them.

---

## Step 1: Verify Code (2 minutes)

```bash
# Navigate to project root
cd d:\a\PointScorer

# Check backend compiles
cd backend
npm install 2>/dev/null
npm run build 2>&1 | head -20

# Check frontend compiles  
cd ../frontend
npm install 2>/dev/null
npm run build 2>&1 | head -20

cd ../
```

Expected: Both should compile without errors.

---

## Step 2: Database Migration (5 minutes)

### For Existing Databases

Connect to MongoDB and run:

```javascript
// 1. Add admin fields to existing users
db.users.updateMany(
  {},
  {
    $set: {
      isAdmin: false,
      isBlocked: false,
      maxFriendsAllowed: 10
    }
  }
)

// 2. Create collection if not exists
db.matchhistories.insertOne({
  _id: "temp",
  userId: null,
  friendId: null,
  matchId: "temp",
  matchName: "temp"
})

// 3. Remove temp document
db.matchhistories.deleteOne({ _id: "temp" })

// 4. Create compound index
db.matchhistories.createIndex(
  {
    userId: 1,
    friendId: 1,
    matchId: 1
  },
  { unique: true }
)

// 5. Verify
db.users.findOne()  // Should have new fields
db.matchhistories.getIndexes()  // Should show compound index
```

### For Fresh Databases
- No migration needed
- Models automatically create on first use

---

## Step 3: Create Admin User (5 minutes)

### Option A: MongoDB Shell
```javascript
// Get bcrypt hash first
// You'll need to run this in Node.js or have it prepared

// Example with pre-hashed password
db.users.insertOne({
  name: "Admin",
  email: "admin@example.com",
  password: "$2b$10$PLACEHOLDER_BCRYPT_HASH",
  isAdmin: true,
  isBlocked: false,
  maxFriendsAllowed: 50,
  activeSessionId: null,
  activeSessionExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### Option B: Use Backend Script
Create `backend/create-admin.js`:
```javascript
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import User from './src/models/User.model.js';

const createAdmin = async () => {
  const password = 'ChangeMe123!';
  const hash = await bcrypt.hash(password, 10);
  
  const admin = new User({
    name: 'Admin',
    email: 'admin@example.com',
    password: hash,
    isAdmin: true,
    maxFriendsAllowed: 50
  });
  
  await admin.save();
  console.log('Admin created - Email: admin@example.com, Password:', password);
};

// Run: node create-admin.js
```

⚠️ **Important**: Change the default password after first login!

---

## Step 4: Environment Setup (3 minutes)

### Backend `.env`
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pointscorer
JWT_SECRET=your-super-secret-key-change-this
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=5000
CORS_ORIGIN=http://localhost:3000
```

### Frontend `.env` (if needed)
```env
VITE_API_URL=http://localhost:5000/api
```

---

## Step 5: Build & Start (3 minutes)

### Backend
```bash
cd backend
npm install
npm run build
npm start

# Expected output:
# Server running on port 5000
# DB connected
```

### Frontend
```bash
cd frontend
npm install
npm run build
# In production, served from backend

# For development:
npm run dev
```

---

## Step 6: Test (10 minutes)

### Test Admin Login
```bash
# 1. Login with admin account
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d {
    "email": "admin@example.com",
    "password": "ChangeMe123!"
  }

# 2. Copy token from response
# 3. Use token in following requests
```

### Test Admin Features
```bash
# Create user
curl -X POST http://localhost:5000/api/admin/users/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d {
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123!",
    "maxFriendsAllowed": 10
  }

# Get all users
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer <token>"

# Block user
curl -X PATCH http://localhost:5000/api/admin/users/<userId>/toggle-block \
  -H "Authorization: Bearer <token>"
```

### Test User Features
```bash
# Create friend
curl -X POST http://localhost:5000/api/friends \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d { "friendName": "Alice" }

# Create match session
curl -X POST http://localhost:5000/api/matches/sessions \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d {
    "friendId": "<friendId>",
    "rulesetId": "<rulesetId>",
    "realMatchId": "ind-eng-123",
    "realMatchName": "India vs England"
  }

# Try to create same session again - should get error
# Try to create template
curl -X POST http://localhost:5000/api/rulesets \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d {
    "rulesetName": "My Template",
    "isTemplate": true,
    "description": "For all T20 matches",
    "rules": [...]
  }
```

---

## Step 7: Frontend Testing (10 minutes)

### Access Admin Dashboard
1. Login with admin account
2. Navigate to `/admin`
3. Verify:
   - [ ] User list displays
   - [ ] Can create user
   - [ ] Can block/unblock
   - [ ] Can update friend limit

### Test User Features
1. Login with regular user
2. Create friend
3. Try to exceed friend limit
4. Try to play same match twice with same friend
5. Create rule template
6. Verify players grouped by team in selection

---

## Step 8: Security Checklist (5 minutes)

Before going live:
- [ ] Change default admin password
- [ ] Update JWT_SECRET in `.env`
- [ ] Enable HTTPS/SSL
- [ ] Set CORS_ORIGIN to your domain
- [ ] Review error messages (no data leakage)
- [ ] Enable rate limiting
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Test with production data volume

---

## Step 9: Deployment (depends on platform)

### Option A: Docker
```dockerfile
# Dockerfile for backend
FROM node:18-alpine
WORKDIR /app
COPY backend/ .
RUN npm ci --only=production
CMD ["npm", "start"]
```

### Option B: Railway/Heroku
```bash
# Push to repository
git add -A
git commit -m "feat: implement major features"
git push origin main

# Deploy via Railway/Heroku dashboard
# Set environment variables
# Deploy
```

### Option C: VPS/Server
```bash
# SSH into server
ssh user@server.com

# Clone repo
git clone <repo_url>
cd PointScorer

# Setup
./deploy.sh  # If you have deploy script

# Or manual:
cd backend && npm ci --production
cd ../frontend && npm ci && npm run build
npm start
```

---

## Troubleshooting

### Admin Dashboard shows 403 Forbidden
```
Fix: User is not admin
- Check user.isAdmin in database
- Re-login after becoming admin
```

### Cannot create friend - "Max friends reached"
```
Fix: User hit limit
- Admin can increase maxFriendsAllowed
- Use admin dashboard
```

### Match replay error
```
Fix: Already played with friend
- Check MatchHistory collection
- Can play with different friend
```

### Team grouping not showing
```
Fix: Squad data structure issue
- Verify API returns team structure
- Check browser console for errors
- May need scraper.service.js update
```

### Blocked user can still login
```
Fix: Cache issue
- Clear browser cache
- Server may need restart
- Check isBlocked field in DB
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Admin routes 403 | User not admin | Update isAdmin in DB or use admin account |
| Migration failed | Connection error | Ensure MongoDB is running |
| Build fails | Missing dependencies | Run `npm install` in backend & frontend |
| Token invalid | Expired or malformed | Re-login and get new token |
| Database connection refused | Wrong URI or service down | Check MONGODB_URI and connection |
| Frontend not compiling | Missing packages | Run `npm install` and `npm run build` |

---

## Performance Tuning

### Database
```javascript
// Ensure indexes exist
db.users.createIndex({ email: 1 })
db.matchhistories.createIndex({ userId: 1, friendId: 1, matchId: 1 }, { unique: true })
db.rulesets.createIndex({ userId: 1, isTemplate: 1 })
```

### Backend
```javascript
// Add caching for templates
const cache = new Map()
```

### Frontend
```javascript
// Lazy load AdminDashboard
React.lazy(() => import('./pages/AdminDashboard'))
```

---

## Monitoring & Logs

### Key Things to Monitor
- Admin login attempts
- User creation/deletion
- Block/unblock actions
- Failed match plays
- Error logs

### Log Setup
```bash
# Backend logs
tail -f logs/app.log

# Frontend errors
// Browser DevTools Console
```

---

## Rollback Plan

If issues occur:

1. **Code Rollback**
   ```bash
   git revert <commit_hash>
   ./deploy.sh
   ```

2. **Database Rollback**
   ```javascript
   // Remove new fields from users
   db.users.updateMany({}, {
     $unset: {
       isAdmin: "",
       isBlocked: "",
       maxFriendsAllowed: ""
     }
   })
   ```

3. **Partial Rollback**
   - Keep user management, disable templates
   - Keep templates, disable admin dash
   - etc.

---

## Success Criteria

Deployment is successful when:

- [x] All 7 features working
- [x] No console errors
- [x] Admin dashboard accessible
- [x] Users can login normally
- [x] Match replay prevention working
- [x] Friend limits enforced
- [x] Templates created and used
- [x] Team grouping displays
- [x] Performance acceptable
- [x] No security issues

---

## Post-Deployment

1. **Verify with Users**
   - Have test users try features
   - Gather feedback
   - Document issues

2. **Monitor**
   - Check error logs
   - Monitor performance
   - Track user activity

3. **Documentation**
   - Share with users
   - Create user guide
   - Document admin procedures

4. **Iterate**
   - Fix any issues
   - Optimize performance
   - Plan v2 features

---

## Support & Contact

If issues arise:
1. Check IMPLEMENTATION_SUMMARY.md
2. Review error messages
3. Check database states
4. Review API responses
5. Check browser console

---

**Deployment Duration**: 30-45 minutes total
**Estimated Downtime**: 5-10 minutes
**Rollback Time**: 10-15 minutes

Ready to deploy? 🚀

