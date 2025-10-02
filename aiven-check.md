# Aiven Database Connection Issues

## Problem
All hostname variations are failing with ENOTFOUND errors, indicating the Aiven service is not reachable.

## Steps to Fix

### 1. Login to Aiven Console
- Go to https://console.aiven.io/
- Login to your account

### 2. Check Service Status
- Look for your PostgreSQL service named "chequemate" or similar
- Check if the service is:
  - ✅ **Running** (green status)
  - ⚠️ **Suspended** (needs payment/reactivation)
  - ❌ **Deleted** (need to recreate)

### 3. Get Correct Connection Details
If service is running, copy the exact connection details:
- **Host**: (exact hostname from Aiven)
- **Port**: (usually 20381 or similar)
- **Database**: (database name)
- **Username**: (usually starts with "avnadmin")
- **Password**: (get from Aiven console)

### 4. Update database.js
Replace the connection details in `config/database.js` with the exact values from Aiven.

## If Service is Suspended/Deleted
You'll need to either:
- **Reactivate** suspended service (may require payment)
- **Create new service** and update connection details
- **Switch to local PostgreSQL** for development

## Quick Test
After updating connection details, run:
```bash
node test-connection.js
```
