# Admin Dashboard Troubleshooting Guide

## ✅ Checklist

### Backend Setup
- [ ] MongoDB is running and accessible
- [ ] Environment variables are set (.env file)
- [ ] Backend server starts without errors
- [ ] Health check passes: `GET /health`

### Admin User Setup
- [ ] Admin user created with `node create-admin.js`
- [ ] Admin email: `admin@pointscorer.com`
- [ ] Admin password: `admin123`
- [ ] User has `isAdmin: true` in database

### Frontend Setup
- [ ] Frontend is running on correct port
- [ ] Token is being stored in localStorage
- [ ] Axios is properly configured
- [ ] Authorization header includes "Bearer {token}"

---

## 🔍 Diagnosis Steps

### Step 1: Verify Backend is Running
```bash
# Test health endpoint
curl http://localhost:5000/health

# Expected response:
# {"status":"OK","db":"connected"}
```

### Step 2: Create Admin User
```bash
cd backend
node create-admin.js

# If successful: Admin user created successfully!
# If exists: Admin user already exists!
```

### Step 3: Test Login Endpoint
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@pointscorer.com",
    "password": "admin123"
  }'

# Expected response:
# {
#   "token": "eyJhbGc...",
#   "user": {
#     "id": "...",
#     "name": "Administrator",
#     "email": "admin@pointscorer.com",
#     "isAdmin": true
#   }
# }
```

### Step 4: Test Admin Users Endpoint
```bash
# Replace TOKEN with actual JWT token from login
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer TOKEN"

# Expected response:
# [
#   {
#     "_id": "...",
#     "name": "Administrator",
#     "email": "admin@pointscorer.com",
#     "isAdmin": true,
#     "isBlocked": false,
#     "maxFriendsAllowed": 50,
#     "createdAt": "...",
#     "updatedAt": "..."
#   }
# ]
```

---

## ❌ Common Issues & Solutions

### Issue: "Failed to fetch users"
**Possible Causes:**
1. Admin user doesn't have `isAdmin: true`
2. Token not being sent in request
3. Backend not running
4. CORS issue

**Solutions:**
```bash
# 1. Check if admin user exists and has isAdmin flag
node scripts/diagnose-admin.js

# 2. Verify backend is running
curl http://localhost:5000/health

# 3. Check browser console for network errors
# - Open DevTools (F12)
# - Go to Network tab
# - Try to fetch users
# - Check the request headers for Authorization
# - Check response status and message
```

### Issue: "Unable to create users"
**Possible Causes:**
1. Admin check failing
2. Validation errors
3. Database connection issue

**Solutions:**
```bash
# Test create user endpoint directly
curl -X POST http://localhost:5000/api/admin/users/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPassword123",
    "maxFriendsAllowed": 10
  }'

# Check response for specific error message
```

### Issue: "Admin access required"
**Possible Causes:**
1. User doesn't have `isAdmin: true`
2. User was demoted or field missing

**Solutions:**
```javascript
// Connect to MongoDB and update user
db.users.updateOne(
  { email: "admin@pointscorer.com" },
  { $set: { isAdmin: true } }
)

// Or run diagnostic
node scripts/diagnose-admin.js
```

### Issue: 401 Unauthorized at Admin Page
**Possible Causes:**
1. Token expired
2. Session invalidated
3. User not logged in

**Solutions:**
1. Logout and login again
2. Clear localStorage and refresh
3. Check token in browser console:
```javascript
localStorage.getItem('token')
localStorage.getItem('user')
```

---

## 🛠️ Debugging Tools

### Browser DevTools
1. **Network Tab:**
   - Check request headers (Authorization)
   - Check response status and body
   - Look for CORS errors

2. **Console Tab:**
   - Check for JavaScript errors
   - Verify token exists: `localStorage.getItem('token')`
   - Verify user exists: `JSON.parse(localStorage.getItem('user'))`

3. **Application Tab:**
   - Check localStorage values
   - Verify token format (should start with "eyJ")

### Backend Logging
Add console logs to check middleware execution:
```javascript
// In admin.routes.js
const adminCheckMiddleware = async (req, res, next) => {
  console.log('👮 Admin check middleware triggered');
  console.log('   userId:', req.userId);
  const user = await User.findById(req.userId);
  console.log('   user found:', !!user);
  console.log('   isAdmin:', user?.isAdmin);
  // ... rest of middleware
};
```

---

## 📋 Pre-Production Checklist

- [ ] Admin user created and verified
- [ ] Login works and returns proper response
- [ ] Admin can fetch users
- [ ] Admin can create users
- [ ] Admin can block/unblock users
- [ ] Admin can delete users
- [ ] Frontend shows correct user list
- [ ] Pagination works
- [ ] Search works
- [ ] All validation messages display correctly
- [ ] Error handling works for edge cases
- [ ] No console errors in browser
- [ ] Proper error messages show in UI

---

## 🚀 Getting Help

If issues persist:

1. Run the diagnostic script:
   ```bash
   node scripts/diagnose-admin.js
   ```

2. Check the actual error messages:
   - Browser console (F12)
   - Network tab responses
   - Backend logs

3. Verify all files are committed:
   ```bash
   git status
   git log --oneline -5
   ```

4. Test individual API endpoints with curl
