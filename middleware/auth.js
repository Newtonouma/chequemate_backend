import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      console.log(`🔐 [AUTH] Token received: ${token.substring(0, 20)}...`);
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
      console.log(`✅ [AUTH] Token decoded successfully, user ID: ${decoded.id}`);
      
      // Find user by ID (need to add this method to User model)
      const user = await User.findById(decoded.id);
      if (!user) {
        console.error(`❌ [AUTH] User not found for ID: ${decoded.id}`);
        res.status(401);
        throw new Error('User not found');
      }
      
      console.log(`✅ [AUTH] User found: ${user.username} (ID: ${user.id})`);
      req.user = user;
      next();
    } catch (error) {
      console.error(`❌ [AUTH] Token validation failed:`, {
        error: error.message,
        tokenPreview: token ? `${token.substring(0, 20)}...` : 'none',
        jwtSecret: process.env.JWT_SECRET ? 'configured' : 'using default'
      });
      
      res.status(401);
      
      // Provide more specific error messages
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired, please login again');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token format');
      } else if (error.message === 'User not found') {
        throw new Error('User account not found');
      } else {
        throw new Error(`Not authorized, token failed: ${error.message}`);
      }
    }
  }

  if (!token) {
    console.warn(`⚠️ [AUTH] No token provided in request headers`);
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});
