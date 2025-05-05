// app.js - IBM Cloud Code Engine API with COS integration
const express = require('express');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

// Import services
const cosService = require('./services/cos.service');
const authService = require('./services/auth.service');

// Import routes
const authRoutes = require('./routes/auth.routes');
const { authenticate, authorize } = require('./middleware/auth.middleware');

// Initialize express app
const app = express();
const port = process.env.PORT || 8080;

// Initialize COS storage
cosService.initUserStorage()
  .then(() => console.log('COS user storage initialized'))
  .catch(err => {
    console.error('COS initialization error:', err);
    console.log('Starting in fallback mode without COS');
  });

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(compression());

// Performance monitoring middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} - ${Date.now() - start}ms`);
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Routes
app.get('/health', async (req, res) => {
  // Check COS connection
  let cosStatus = 'unknown';
  
  try {
    await cosService.getUserIndex();
    cosStatus = 'connected';
  } catch (error) {
    cosStatus = 'disconnected';
    console.error('COS health check error:', error.message);
  }
  
  res.json({ 
    status: 'healthy', 
    version: '1.3.0',
    storage: cosStatus
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Protected route - any authenticated user
app.get('/api/protected', authenticate, (req, res) => {
  res.json({
    message: 'Access granted',
    user: {
      id: req.user.sub || req.user.id,
      username: req.user.username,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

// Admin-only route
app.get('/api/admin', authenticate, authorize('admin'), (req, res) => {
  res.json({
    message: 'Admin access granted',
    user: {
      id: req.user.sub || req.user.id,
      username: req.user.username,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

// User management routes (admin only)
app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const marker = req.query.marker || null;
    
    const result = await cosService.listUsers(limit, marker);
    
    res.json(result);
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({
      error: 'Failed to list users',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'Configured' : 'NOT CONFIGURED - USING DEFAULT'}`);
});
