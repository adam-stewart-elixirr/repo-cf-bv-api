// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const authService = require('../services/auth.service');
const cosService = require('../services/cos.service');
const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, email, and password are required'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password must be at least 8 characters long'
      });
    }
    
    // Create user
    const user = await cosService.createUser({
      username,
      email,
      password,
      role: 'user'
    });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate user
    if (error.message === 'Username or email already exists') {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username or email is already in use'
      });
    }
    
    res.status(500).json({
      error: 'Registration failed',
      message: 'Could not complete registration'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Basic validation
    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }
    
    const result = await authService.authenticateUser(username, password);
    
    if (!result.success) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: result.message
      });
    }
    
    // Generate token
    const token = authService.generateToken(result.user);
    
    // Calculate expiry
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 1); // Using 1 hour from JWT config
    
    res.json({
      token,
      expiresIn: 3600, // seconds
      tokenType: 'Bearer',
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Could not complete login process'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const verification = authService.verifyToken(token);
    
    if (!verification.success) {
      return res.status(401).json({ 
        error: 'Invalid token', 
        message: verification.message 
      });
    }
    
    // Get user data
    const userId = verification.user.sub;
    const user = await cosService.getUser(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User no longer exists'
      });
    }
    
    // Return user data without password
    const { password, ...userProfile } = user;
    
    res.json(userProfile);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      error: 'Could not retrieve profile',
      message: error.message
    });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const verification = authService.verifyToken(token);
    
    if (!verification.success) {
      return res.status(401).json({ 
        error: 'Invalid token', 
        message: verification.message 
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'New password must be at least 8 characters long'
      });
    }
    
    // Get user
    const userId = verification.user.sub;
    const user = await cosService.getUser(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User no longer exists'
      });
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await cosService.updateUser(userId, { password: hashedPassword });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Could not change password',
      message: error.message
    });
  }
});

module.exports = router;
