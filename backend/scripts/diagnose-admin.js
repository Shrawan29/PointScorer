#!/usr/bin/env node
/**
 * Diagnostic script to check admin setup
 * Usage: node scripts/diagnose-admin.js
 */

import mongoose from 'mongoose';
import User from '../src/models/User.model.js';
import ENV from '../src/config/env.js';

async function diagnose() {
  console.log('🔍 Starting Admin Setup Diagnosis...\n');

  try {
    // Connect to MongoDB
    console.log('1️⃣  Connecting to MongoDB...');
    await mongoose.connect(ENV.MONGO_URI);
    console.log('✅ MongoDB connected\n');

    // Check for admin users
    console.log('2️⃣  Checking for admin users...');
    const adminUsers = await User.find({ isAdmin: true }).select('name email isAdmin isBlocked maxFriendsAllowed');
    
    if (adminUsers.length === 0) {
      console.log('❌ NO ADMIN USERS FOUND!');
      console.log('   You need to create an admin user first.\n');
      console.log('   Run: node create-admin.js\n');
    } else {
      console.log(`✅ Found ${adminUsers.length} admin user(s):\n`);
      adminUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.name}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Blocked: ${user.isBlocked}`);
        console.log(`      Max Friends: ${user.maxFriendsAllowed}\n`);
      });
    }

    // Check total user count
    console.log('3️⃣  Total users in database...');
    const totalUsers = await User.countDocuments();
    console.log(`✅ Total users: ${totalUsers}\n`);

    // Check for users without required fields
    console.log('4️⃣  Checking for users with missing fields...');
    const usersWithMissingFields = await User.find({
      $or: [
        { isAdmin: { $exists: false } },
        { isBlocked: { $exists: false } },
        { maxFriendsAllowed: { $exists: false } },
      ],
    }).select('name email');

    if (usersWithMissingFields.length > 0) {
      console.log(`⚠️  Found ${usersWithMissingFields.length} user(s) with missing fields.\n`);
      console.log('   Fixing missing fields...\n');
      
      await User.updateMany(
        {
          $or: [
            { isAdmin: { $exists: false } },
            { isBlocked: { $exists: false } },
            { maxFriendsAllowed: { $exists: false } },
          ],
        },
        {
          $set: {
            isAdmin: false,
            isBlocked: false,
            maxFriendsAllowed: 10,
          },
        }
      );
      
      console.log('✅ Fixed missing fields\n');
    } else {
      console.log('✅ All users have required fields\n');
    }

    // List sample users
    console.log('5️⃣  Sample users (last 5)...');
    const sampleUsers = await User.find().select('name email isAdmin isBlocked').sort({ createdAt: -1 }).limit(5);
    
    if (sampleUsers.length === 0) {
      console.log('❌ No users in database\n');
    } else {
      console.log('✅ Recent users:\n');
      sampleUsers.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.name} (${user.email})`);
        console.log(`      Admin: ${user.isAdmin}, Blocked: ${user.isBlocked}\n`);
      });
    }

    // Environment check
    console.log('6️⃣  Environment variables...');
    console.log(`✅ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ JWT_SECRET: ${ENV.JWT_SECRET ? '✓ Set' : '❌ Not set'}`);
    console.log(`✅ MONGO_URI: ${ENV.MONGO_URI ? '✓ Set' : '❌ Not set'}\n`);

    console.log('═══════════════════════════════════════════════════');
    console.log('📋 Summary:');
    console.log('═══════════════════════════════════════════════════\n');
    
    if (adminUsers.length > 0) {
      console.log('✅ Admin setup look good!');
      console.log('   You can login with admin credentials to access the admin dashboard.\n');
    } else {
      console.log('❌ Admin setup incomplete');
      console.log('   Steps to fix:');
      console.log('   1. Create admin user: node create-admin.js');
      console.log('   2. Verify login works with admin credentials');
      console.log('   3. Access admin dashboard at /admin\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Diagnosis complete.\n');
    process.exit(adminUsers && adminUsers.length > 0 ? 0 : 1);
  }
}

diagnose();
