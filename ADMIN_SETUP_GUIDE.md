# 🚀 Admin System Setup Guide

## Quick Start (5 Minutes)

### Step 1: Create Admin User
```bash
cd backend
node create-admin.js
```

**Output should be:**
```
✅ Admin user created successfully!

📋 Login Credentials:
   Email: admin@pointscorer.com
   Password: admin123

⚠️  Please change password after first login!
```

### Step 2: Start Backend
```bash
npm start
```

**Should see:**
```
Server is running on port 5000
```

### Step 3: Start Frontend (in new terminal)
```bash
cd frontend
npm run dev
```

**Should see:**
```
➜  Local:   http://localhost:5173/
```

### Step 4: Login as Admin
1. Open http://localhost:5173
2. Click "Sign in"
3. Email: `admin@pointscorer.com`
4. Password: `admin123`
5. Click "Sign in"

### Step 5: Access Admin Dashboard
1. You should see "Admin" link in navigation (top right)
2. Click "Admin"
3. You should see the user list

---

## Detailed Verification

### ✅ Check 1: Backend is Running
```bash
# In a new terminal, test health endpoint
curl http://localhost:5000/health

# Expected response:
# {"status":"OK","db":"connected"}
```

### ✅ Check 2: Admin User Exists
```bash
# Run diagnostic
cd backend
node scripts/diagnose-admin.js

# Should show admin user in output
```

### ✅ Check 3: Can Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@pointscorer.com",
    "password": "admin123"
  }'

# Expected response includes:
# "token": "eyJhbGc...",
# "user": {"id": "...", "name": "Administrator", "isAdmin": true}
```

### ✅ Check 4: Can Fetch Users
After getting the token from Check 3, run:
```bash
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer PASTE_TOKEN_HERE"

# Should return array of users
```

### ✅ Check 5: Frontend Configuration
1. Open browser DevTools (F12)
2. Go to console tab
3. Paste and run:
```javascript
// Check if token exists
console.log('Token:', localStorage.getItem('token')?.substring(0, 20) + '...');

// Check if user exists
console.log('User:', JSON.parse(localStorage.getItem('user')));

// Check admin status
console.log('Is Admin:', JSON.parse(localStorage.getItem('user'))?.isAdmin);
```

**You should see:**
```
Token: eyJhbGc...
User: {id: "...", name: "Administrator", email: "admin@pointscorer.com", isAdmin: true}
Is Admin: true
```

---

## Troubleshooting

### Problem: "Failed to fetch users" on Admin Dashboard

**Solution:**
1. Check browser console for specific error
2. Run diagnostic: `node scripts/diagnose-admin.js`
3. Check admin user has `isAdmin: true`
4. Try logging out and back in
5. Check that token is valid (hasn't expired)

### Problem: "Admin" link doesn't appear in navigation

**Likely causes:**
- User doesn't have `isAdmin: true`
- Token not being saved properly
- Page not refreshing after login

**Solution:**
```bash
# 1. Check admin status in browser console
JSON.parse(localStorage.getItem('user'))?.isAdmin

# Should print: true

# 2. If false, update user in database
# MongoDB:
db.users.updateOne(
  { email: "admin@pointscorer.com" },
  { $set: { isAdmin: true } }
)

# 3. Logout and login again
```

### Problem: Login returns "Account blocked"

**Solution:**
```bash
# Unblock the user
# MongoDB:
db.users.updateOne(
  { email: "admin@pointscorer.com" },
  { $set: { isBlocked: false } }
)
```

### Problem: Can't create users on admin dashboard

**Possible reasons:**
1. Admin check is failing
2. Validation error
3. Database error

**Debug steps:**
1. Check browser network tab (F12)
2. Look at the POST request to `/api/admin/users/create`
3. Check the response status and error message
4. Run `node scripts/test-admin-api.js` to test endpoint directly

---

## Complete System Test

Run this script to test everything:
```bash
node backend/scripts/test-admin-api.js
```

Follow the prompts and it will:
1. Test health endpoint
2. Test login
3. Test fetch users
4. Test create user
5. Test get user
6. Test update user
7. Test block user
8. Test unblock user
9. Test delete user

**All should pass with ✅**

---

## Environment Variables

Create `.env` file in `backend/` directory:
```
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET=your-very-secret-key-change-this
JWT_EXPIRES_IN=7d
```

---

## Common Mistakes

❌ **Don't do:**
- Forget to run `node create-admin.js`
- Use wrong email/password for login
- Modify token in localStorage manually
- Forget to install dependencies (`npm install`)
- Run frontend and backend on wrong ports

✅ **Do:**
- Create admin user first
- Login with correct credentials
- Let app handle token management
- Install all dependencies
- Use recommended ports (5000 backend, 5173 frontend)

---

## File Structure

```
backend/
├── create-admin.js          # Run this first
├── scripts/
│   ├── diagnose-admin.js    # Check admin setup
│   └── test-admin-api.js    # Test all endpoints
├── src/
│   ├── controllers/
│   │   └── admin.controller.js
│   ├── routes/
│   │   └── admin.routes.js
│   ├── middlewares/
│   │   └── auth.middleware.js
│   └── models/
│       └── User.model.js

frontend/
└── src/
    └── pages/
        └── AdminDashboard.jsx
```

---

## Success Checklist

After completing setup, you should have:
- [ ] Admin user created with `node create-admin.js`
- [ ] Backend running on port 5000
- [ ] Frontend running on port 5173
- [ ] Can login with admin@pointscorer.com / admin123
- [ ] "Admin" link appears in navigation after login
- [ ] Can click Admin and see user list
- [ ] Can create new users
- [ ] Can search users
- [ ] Can block/unblock users
- [ ] Can update friend limits
- [ ] Can delete users
- [ ] Pagination works
- [ ] No console errors (F12)
- [ ] All network requests return 200-201 status

---

## Next Steps

Once admin dashboard is working:

1. **Change admin password:**
   - Login as admin
   - Account settings (implement this feature)
   - Change password to something secure

2. **Create additional users:**
   - Go to Admin Dashboard
   - Click "+ Add User"
   - Fill in details
   - Click "Create User"

3. **Manage users:**
   - Search for users
   - Click on friend limit to edit
   - Block suspicious accounts
   - Delete inactive users

4. **Monitor system:**
   - Check user creation logs
   - Review blocked accounts
   - Adjust friend limits as needed

---

## Support

If you get stuck:

1. **Run diagnostics:**
   ```bash
   node backend/scripts/diagnose-admin.js
   ```

2. **Test endpoints:**
   ```bash
   node backend/scripts/test-admin-api.js
   ```

3. **Check documentation:**
   - `ADMIN_TROUBLESHOOTING.md` - Detailed troubleshooting
   - `ADMIN_CODE_REVIEW.md` - Code structure and flow
   - `FEATURES_IMPLEMENTATION.md` - Feature overview

4. **Check browser console:**
   - F12 → Console tab
   - Look for error messages
   - Check network tab for failed requests

---

**Happy administrating!** 🎉
