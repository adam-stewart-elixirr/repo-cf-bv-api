// scripts/seed-users.js
require('dotenv').config();
const cosService = require('../services/cos.service');

const seedUsers = [
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'Admin123!',
    role: 'admin'
  },
  {
    username: 'user1',
    email: 'user1@example.com',
    password: 'User123!',
    role: 'user'
  },
  {
    username: 'user2',
    email: 'user2@example.com',
    password: 'User123!',
    role: 'user'
  }
];

const seedDatabase = async () => {
  try {
    // Initialize COS storage
    console.log('Initializing COS storage...');
    await cosService.initUserStorage();
    console.log('COS storage initialized');

    // Create seed users
    console.log('Creating seed users...');
    for (const userData of seedUsers) {
      try {
        // Check if user exists
        const existingUser = await cosService.getUserByIdentifier(userData.username);
        
        if (!existingUser) {
          await cosService.createUser(userData);
          console.log(`Created user: ${userData.username} (${userData.role})`);
        } else {
          console.log(`User ${userData.username} already exists`);
        }
      } catch (error) {
        console.error(`Error creating user ${userData.username}:`, error.message);
