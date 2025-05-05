// services/cos.service.js
const { S3 } = require('ibm-cos-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Initialize COS
let cos;

function getCOSClient() {
  if (!cos) {
    cos = new S3({
      endpoint: process.env.COS_ENDPOINT,
      apiKeyId: process.env.COS_API_KEY,
      serviceInstanceId: process.env.COS_INSTANCE_ID,
      signatureVersion: 'v4'
    });
  }
  return cos;
}

// Get bucket name from environment or use default
const BUCKET_NAME = process.env.COS_BUCKET_NAME || 'api-users';
const USERS_PREFIX = 'users/';
const INDEX_KEY = 'indices/username-email-index.json';

// Initialize users bucket
async function initUserStorage() {
  const cos = getCOSClient();
  
  try {
    // Check if bucket exists
    await cos.headBucket({ Bucket: BUCKET_NAME }).promise();
    console.log(`Bucket ${BUCKET_NAME} already exists`);
  } catch (error) {
    if (error.code === 'NoSuchBucket' || error.code === 'NotFound') {
      // Create bucket
      await cos.createBucket({
        Bucket: BUCKET_NAME,
        CreateBucketConfiguration: {
          LocationConstraint: process.env.COS_LOCATION || 'us-south-standard'
        }
      }).promise();
      console.log(`Created bucket ${BUCKET_NAME}`);
      
      // Initialize index
      await updateUserIndex({});
    } else {
      throw error;
    }
  }
}

// Get the username/email index
async function getUserIndex() {
  const cos = getCOSClient();
  
  try {
    const data = await cos.getObject({
      Bucket: BUCKET_NAME,
      Key: INDEX_KEY
    }).promise();
    
    return JSON.parse(data.Body.toString());
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return {};
    }
    throw error;
  }
}

// Update the username/email index
async function updateUserIndex(index) {
  const cos = getCOSClient();
  
  await cos.putObject({
    Bucket: BUCKET_NAME,
    Key: INDEX_KEY,
    Body: JSON.stringify(index),
    ContentType: 'application/json'
  }).promise();
}

// Get user by username or email
async function getUserByIdentifier(identifier) {
  const index = await getUserIndex();
  const userId = index[identifier.toLowerCase()];
  
  if (!userId) {
    return null;
  }
  
  return getUser(userId);
}

// Get user by ID
async function getUser(userId) {
  const cos = getCOSClient();
  
  try {
    const data = await cos.getObject({
      Bucket: BUCKET_NAME,
      Key: `${USERS_PREFIX}${userId}.json`
    }).promise();
    
    return JSON.parse(data.Body.toString());
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

// Create user
async function createUser(userData) {
  const cos = getCOSClient();
  
  // Check if username or email already exists
  const index = await getUserIndex();
  
  if (index[userData.username.toLowerCase()] || index[userData.email.toLowerCase()]) {
    throw new Error('Username or email already exists');
  }
  
  // Generate ID
  const userId = crypto.randomUUID();
  
  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userData.password, salt);
  
  // Create user object
  const user = {
    id: userId,
    username: userData.username,
    email: userData.email.toLowerCase(),
    password: hashedPassword,
    role: userData.role || 'user',
    active: true,
    createdAt: new Date().toISOString()
  };
  
  // Save user
  await cos.putObject({
    Bucket: BUCKET_NAME,
    Key: `${USERS_PREFIX}${userId}.json`,
    Body: JSON.stringify(user),
    ContentType: 'application/json'
  }).promise();
  
  // Update index
  index[user.username.toLowerCase()] = userId;
  index[user.email.toLowerCase()] = userId;
  await updateUserIndex(index);
  
  // Return user without password
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Update user
async function updateUser(userId, updates) {
  const cos = getCOSClient();
  
  // Get current user
  const user = await getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Update fields
  const updatedUser = { ...user, ...updates };
  
  // If updating username or email, update index
  if (updates.username || updates.email) {
    const index = await getUserIndex();
    
    // Remove old username/email from index
    if (updates.username && user.username !== updates.username) {
      delete index[user.username.toLowerCase()];
      index[updates.username.toLowerCase()] = userId;
    }
    
    if (updates.email && user.email !== updates.email) {
      delete index[user.email.toLowerCase()];
      index[updates.email.toLowerCase()] = userId;
    }
    
    await updateUserIndex(index);
  }
  
  // Save updated user
  await cos.putObject({
    Bucket: BUCKET_NAME,
    Key: `${USERS_PREFIX}${userId}.json`,
    Body: JSON.stringify(updatedUser),
    ContentType: 'application/json'
  }).promise();
  
  // Return user without password
  const { password, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
}

// Delete user
async function deleteUser(userId) {
  const cos = getCOSClient();
  
  // Get user
  const user = await getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Update index
  const index = await getUserIndex();
  delete index[user.username.toLowerCase()];
  delete index[user.email.toLowerCase()];
  await updateUserIndex(index);
  
  // Delete user object
  await cos.deleteObject({
    Bucket: BUCKET_NAME,
    Key: `${USERS_PREFIX}${userId}.json`
  }).promise();
  
  return { success: true };
}

// List users (with pagination)
async function listUsers(limit = 100, marker = null) {
  const cos = getCOSClient();
  
  const params = {
    Bucket: BUCKET_NAME,
    Prefix: USERS_PREFIX,
    MaxKeys: limit
  };
  
  if (marker) {
    params.Marker = marker;
  }
  
  const data = await cos.listObjects(params).promise();
  
  // Load user data for each key
  const users = await Promise.all(
    data.Contents.map(async (item) => {
      const userId = item.Key.replace(USERS_PREFIX, '').replace('.json', '');
      const user = await getUser(userId);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
      return null;
    })
  );
  
  return {
    users: users.filter(Boolean),
    nextMarker: data.IsTruncated ? data.Contents[data.Contents.length - 1].Key : null
  };
}

module.exports = {
  initUserStorage,
  getUserIndex,
  getUserByIdentifier,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  listUsers
};
