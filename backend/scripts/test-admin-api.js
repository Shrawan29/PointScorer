#!/usr/bin/env node
/**
 * Quick API Test Script
 * Tests admin endpoints to verify they work correctly
 */

import axios from 'axios';
import readline from 'readline';

const API_BASE = process.env.API_BASE || 'http://localhost:5000';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function test() {
  console.log('\n🧪 PointScorer Admin API Test Suite');
  console.log('=====================================\n');

  let token = null;
  let userData = null;

  try {
    // Test 1: Health check
    console.log('1️⃣  Testing health endpoint...');
    const healthRes = await axios.get(`${API_BASE}/health`);
    console.log(`✅ Health check passed: ${healthRes.data.db}\n`);

    // Test 2: Login
    console.log('2️⃣  Testing login...');
    const email = await question('   Admin email (default: admin@pointscorer.com): ') || 'admin@pointscorer.com';
    const password = await question('   Admin password (default: admin123): ') || 'admin123';

    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
    token = loginRes.data.token;
    userData = loginRes.data.user;

    if (!userData.isAdmin) {
      console.log('❌ User is not admin!');
      process.exit(1);
    }

    console.log(`✅ Login successful`);
    console.log(`   User: ${userData.name} (${userData.email})`);
    console.log(`   ID: ${userData.id}\n`);

    // Test 3: Fetch users
    console.log('3️⃣  Testing fetch users...');
    const usersRes = await axios.get(`${API_BASE}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`✅ Fetched ${usersRes.data.length} user(s)`);
    usersRes.data.slice(0, 3).forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.name} (${u.email}) - Admin: ${u.isAdmin}`);
    });
    console.log('');

    // Test 4: Create test user
    console.log('4️⃣  Testing create user...');
    const createRes = await axios.post(
      `${API_BASE}/api/admin/users/create`,
      {
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'TestPass123',
        maxFriendsAllowed: 10,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log(`✅ User created successfully`);
    console.log(`   Name: ${createRes.data.user.name}`);
    console.log(`   Email: ${createRes.data.user.email}\n`);

    // Test 5: Get user by ID
    console.log('5️⃣  Testing get user by ID...');
    const getUserRes = await axios.get(`${API_BASE}/api/admin/users/${createRes.data.user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`✅ Retrieved user: ${getUserRes.data.name}\n`);

    // Test 6: Update user
    console.log('6️⃣  Testing update user...');
    const updateRes = await axios.put(
      `${API_BASE}/api/admin/users/${createRes.data.user.id}`,
      {
        maxFriendsAllowed: 20,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log(`✅ User updated: max friends = ${updateRes.data.user.maxFriendsAllowed}\n`);

    // Test 7: Block user
    console.log('7️⃣  Testing block user...');
    const blockRes = await axios.patch(
      `${API_BASE}/api/admin/users/${createRes.data.user.id}/toggle-block`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log(`✅ User blocked: ${blockRes.data.user.isBlocked}\n`);

    // Test 8: Unblock user
    console.log('8️⃣  Testing unblock user...');
    const unblockRes = await axios.patch(
      `${API_BASE}/api/admin/users/${createRes.data.user.id}/toggle-block`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log(`✅ User unblocked: ${!unblockRes.data.user.isBlocked}\n`);

    // Test 9: Delete user
    console.log('9️⃣  Testing delete user...');
    const deleteRes = await axios.delete(`${API_BASE}/api/admin/users/${createRes.data.user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`✅ User deleted\n`);

    // Summary
    console.log('═════════════════════════════════════════');
    console.log('✅ All tests passed!');
    console.log('═════════════════════════════════════════\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.response?.data?.message || error.message}`);
    if (error.response?.status === 403) {
      console.error('   → User is not admin or admin access denied');
    } else if (error.response?.status === 401) {
      console.error('   → Authentication failed or token invalid');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

test();
