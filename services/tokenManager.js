import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

class TokenManager {
  constructor() {
    this.accessToken = null;
    this.expiryTime = null;
    this.refreshInterval = null;
    this.tokenFile = './token.json';
    
    // Load credentials from env
    this.host = process.env.ONIT_HOST || 'api.onitmfbank.com';
    this.userId = process.env.ONIT_USER_ID || '1003';
    this.password = process.env.ONIT_PASSWORD || 'ONIT-En7Ao3';
  }

  async initialize() {
    try {
      // Try to load cached token first
      await this.loadTokenFromCache();
      
      // If no valid token, get a new one
      if (!this.isTokenValid()) {
        await this.refreshToken();
      }
      
      // Set up auto-refresh before expiration
      this.setupAutoRefresh();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize token manager:', error);
      return false;
    }
  }
  
  isTokenValid() {
    return this.accessToken && this.expiryTime && new Date().getTime() < this.expiryTime;
  }
  
  async getToken() {
    if (!this.isTokenValid()) {
      await this.refreshToken();
    }
    return this.accessToken;
  }
  
  async refreshToken() {
    try {
      console.log('🔑 Getting new access token...');
      
      const url = `https://${this.host}/api/v1/auth/jwt`;
      console.log(`🔗 Auth URL: ${url}`);
      
      // Same auth process as in auth.js - userId should be number
      const response = await axios.post(url, {
        userId: Number(this.userId),
        password: this.password
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      this.accessToken = response.data.access_token;
      // Convert validity from minutes to milliseconds and subtract 2 minutes for safety
      const validityMs = (response.data.validity * 60 * 1000) - (2 * 60 * 1000); 
      this.expiryTime = new Date().getTime() + validityMs;
      
      // Save to cache
      this.saveTokenToCache();
      
      console.log(`🔑 New token acquired, valid until: ${new Date(this.expiryTime).toISOString()}`);
      return this.accessToken;
    } catch (error) {
      console.error('Failed to refresh token:', error.response?.data || error.message || error);
      throw error;
    }
  }
  
  setupAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    if (this.expiryTime) {
      const timeToRefresh = this.expiryTime - new Date().getTime() - (5 * 60 * 1000); // 5 min before expiry
      if (timeToRefresh > 0) {
        this.refreshInterval = setTimeout(async () => {
          try {
            await this.refreshToken();
            this.setupAutoRefresh();
          } catch (error) {
            console.error('Auto-refresh failed:', error);
          }
        }, timeToRefresh);
        console.log(`🔄 Token auto-refresh scheduled in ${Math.round(timeToRefresh/60000)} minutes`);
      }
    }
  }
  
  async loadTokenFromCache() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const data = fs.readFileSync(this.tokenFile, 'utf8');
        const tokenData = JSON.parse(data);
        this.accessToken = tokenData.accessToken;
        this.expiryTime = tokenData.expiryTime;
        
        if (this.isTokenValid()) {
          console.log(`🔑 Loaded cached token, valid until: ${new Date(this.expiryTime).toISOString()}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to load token from cache:', error);
      return false;
    }
  }
  
  saveTokenToCache() {
    try {
      fs.writeFileSync(this.tokenFile, JSON.stringify({
        accessToken: this.accessToken,
        expiryTime: this.expiryTime
      }));
    } catch (error) {
      console.error('Failed to save token to cache:', error);
    }
  }
}

const tokenManager = new TokenManager();
export default tokenManager;
