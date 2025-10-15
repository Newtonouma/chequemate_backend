# Environment Configuration Guide

## Overview
This project uses environment variables for configuration. Different URLs are used for local development vs production deployment.

---

## 🔧 Local Development Setup

### 1. Copy the example file:
```bash
cp .env.example .env
```

### 2. Update `.env` with your local configuration:

**Key Settings for Local Development:**
```bash
# Use your ngrok URL for local testing
ONIT_CALLBACK_URL=https://resorptive-prenatural-desiree.ngrok-free.dev/api/payments/callback

# Local database
DATABASE_URL=postgresql://postgres:9530@localhost:5432/chequemate

# Development mode
NODE_ENV=development
```

### 3. Start ngrok tunnel:
```bash
ngrok http 3002
```
- Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)
- Update `ONIT_CALLBACK_URL` in `.env`
- **Important:** Update this URL in ONIT merchant dashboard too!

### 4. Configure ONIT Dashboard:
1. Login to ONIT merchant portal
2. Go to Settings → Webhooks/Callbacks
3. Set callback URL to your ngrok URL: `https://your-ngrok-url.ngrok-free.dev/api/payments/callback`
4. Save changes

---

## 🚀 Production Deployment (Render)

### Environment Variables to Set in Render Dashboard:

```bash
# Production callback URL
ONIT_CALLBACK_URL=https://chequemate-backend-n13g.onrender.com/api/payments/callback

# Database (automatically set by Render)
DATABASE_URL=postgresql://...

# ONIT Credentials
ONIT_HOST=api.onitmfbank.com
ONIT_USER_ID=1003
ONIT_PASSWORD=ONIT-En7Ao3
ONIT_ACCOUNT=0001650000002

# Security
NODE_ENV=production
JWT_SECRET=generate_a_strong_random_secret_here

# Chess.com API
CHESS_COM_USERNAME=rookwitdahooks
CHESS_COM_EMAIL=rolljoe42@gmail.com

# Payment defaults
SOURCE_ACCOUNT=0001650000002
CHANNEL=MPESA
PRODUCT=CA05
```

### ONIT Production Configuration:
1. Login to ONIT merchant portal (production account)
2. Set callback URL to: `https://chequemate-backend-n13g.onrender.com/api/payments/callback`
3. Ensure merchant account has sufficient balance

---

## 🔄 Switching Between Environments

### Currently Active (Local Development):
```bash
ONIT_CALLBACK_URL=https://resorptive-prenatural-desiree.ngrok-free.dev/api/payments/callback
```

### To Switch to Production (Before Deploying):
1. Comment out ngrok URL
2. Uncomment production URL
```bash
# ONIT_CALLBACK_URL=https://resorptive-prenatural-desiree.ngrok-free.dev/api/payments/callback
ONIT_CALLBACK_URL=https://chequemate-backend-n13g.onrender.com/api/payments/callback
```

**OR** use separate `.env.production` file on Render.

---

## 🧪 Testing Callbacks

### Test Local Callback:
```bash
curl -X POST https://resorptive-prenatural-desiree.ngrok-free.dev/api/payments/callback \
  -H "Content-Type: application/json" \
  -d '{
    "checkoutRequestID": "test123",
    "resultCode": 0,
    "resultDesc": "Success"
  }'
```

### Test Production Callback:
```bash
curl -X POST https://chequemate-backend-n13g.onrender.com/api/payments/callback \
  -H "Content-Type: application/json" \
  -d '{
    "checkoutRequestID": "test123",
    "resultCode": 0,
    "resultDesc": "Success"
  }'
```

---

## 📝 Important Notes

### ⚠️ Security:
- **NEVER commit `.env` file** - It contains secrets!
- Use strong JWT secret in production
- Keep ONIT credentials secure

### 🔄 ngrok URL Changes:
- Free ngrok URLs change every restart
- Update both:
  1. `.env` file → `ONIT_CALLBACK_URL`
  2. ONIT merchant dashboard → Webhook URL

### 🐛 Troubleshooting Stuck Payments:
If you see "110 stuck payments" error:
1. Check ngrok tunnel is running: `ngrok http 3002`
2. Verify callback URL matches ngrok URL exactly
3. Test callback endpoint manually (see commands above)
4. Check ONIT dashboard for failed webhook deliveries
5. Ensure merchant account has sufficient balance

---

## 📚 File Structure

```
Backend/
├── .env                    # Local config (NEVER commit!)
├── .env.example           # Template (commit this)
├── .env.production        # Production template (optional)
└── ENV_CONFIG.md          # This file
```

---

## 🎯 Quick Commands

```bash
# Start local development with ngrok
ngrok http 3002                    # Terminal 1
npm start                          # Terminal 2

# Check current callback URL
grep ONIT_CALLBACK_URL .env

# Test callback endpoint
curl -I https://your-ngrok-url.ngrok-free.dev/api/payments/callback
```

---

**Need Help?** Check the logs for callback errors:
```bash
# Server logs show callback attempts
tail -f logs/app.log

# Look for lines like:
# ✅ [PAYMENT_CALLBACK] Received callback...
# ❌ [PAYMENT_CALLBACK] Error processing callback...
```
