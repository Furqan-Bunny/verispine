const { userUtils } = require('../utils/firestore');
const dotenv = require('dotenv');

dotenv.config();

async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    // Check if test user already exists
    const existingUser = await userUtils.findByEmail('test@quicksell.com');
    if (existingUser) {
      console.log('Test user already exists');
      return;
    }
    
    // Create test user
    const testUser = await userUtils.create({
      username: 'testuser',
      email: 'test@quicksell.com',
      password: 'Test123!', // Will be hashed automatically
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      emailVerified: true,
      isActive: true,
      balance: 100, // Give some test balance
      preferences: {
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        categories: []
      },
      wishlist: [],
      following: [],
      followers: [],
      ratings: {
        average: 0,
        count: 0
      }
    });
    
    console.log('Test user created successfully!');
    console.log('Email: test@quicksell.com');
    console.log('Password: Test123!');
    console.log('User ID:', testUser.id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();