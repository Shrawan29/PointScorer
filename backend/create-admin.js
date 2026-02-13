import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import User from './src/models/User.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
  try {
    console.log(' Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = new User({
      name: 'Administrator',
      email: 'admin@pointscorer.com',
      password: hashedPassword,
      isAdmin: true,
      isBlocked: false,
      maxFriendsAllowed: 50
    });
    
    await admin.save();
    console.log(' Admin user created successfully!');
    console.log('');
    console.log(' Login Credentials:');
    console.log('   Email: admin@pointscorer.com');
    console.log('   Password: admin123');
    console.log('');
    console.log('  Please change password after first login!');
    console.log('');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    if (err.code === 11000) {
      console.log(' Admin user already exists!');
      console.log('   Email: admin@pointscorer.com');
      console.log('   Password: admin123');
      process.exit(0);
    } else {
      console.error(' Error:', err.message);
      process.exit(1);
    }
  }
}

createAdmin();
