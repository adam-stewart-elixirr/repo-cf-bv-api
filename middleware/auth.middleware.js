// middleware/auth.middleware.js
const authService = require('../services/auth.service');

exports.authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  
  // Bearer Token Auth
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    const verification = authService.verifyToken(token);
    
    if (!verification.success) {
      return res.status(401).json({ 
        error: 'Invalid token', 
        message: verification.message 
      });
    }
    
    req.user = verification.user;
    next();
  } 
  // Basic Auth
  else if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    const user = await authService.basicAuth(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.user = user;
    next();
  } 
  // Unsupported auth type
  else {
    return res.status(401).json({ error: 'Unsupported authorization method' });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userRole = req.user.role || 'user';
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
};
