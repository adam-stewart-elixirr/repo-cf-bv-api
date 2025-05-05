// services/auth.service.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cosService = require('./cos.service');

// Token cache for performance
const tokenCache = new Map();

// Authenticate a user
async function authenticateUser(username, password) {
  try {
    // Find user by username or email
    const user = await cosService.getUserByIdentifier(username);
    
    // User not found
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }
    
    // Account disabled
    if (!user.active) {
      return { success: false, message: 'Account is disabled' };
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { success: false, message: 'Invalid credentials' };
    }
    
    // Create user object without sensitive data
    const { password: _, ...userObj } = user;
    
    return { success: true, user: userObj };
  } catch (error) {
    console.error('Auth error:', error);
    return { success: false, message: 'Authentication error' };
  }
}

// Generate JWT token
function generateToken(user) {
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
  
  return jwt.sign(
    payload, 
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

// Verify token
function verifyToken(token) {
  // Check cache first
  if (tokenCache.has(token)) {
    return { success: true, user: tokenCache.get(token) };
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Cache token
    tokenCache.set(token, decoded);
    
    // Set cache expiry
    setTimeout(() => tokenCache.delete(token), 
      (decoded.exp * 1000) - Date.now());
    
    return { success: true, user: decoded };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Basic auth
async function basicAuth(username, password) {
  const result = await authenticateUser(username, password);
  return result.success ? result.user : null;
}

module.exports = {
  authenticateUser,
  generateToken,
  verifyToken,
  basicAuth
};
