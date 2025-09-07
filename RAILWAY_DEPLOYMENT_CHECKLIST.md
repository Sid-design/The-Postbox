# Railway Deployment Checklist

## 🚀 Pre-Deployment Setup

### 1. Environment Variables (Set in Railway Dashboard)
```bash
# Core Application
NODE_ENV=production
PORT=3000

# Google OAuth2 & Gmail API  
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
PRODUCTION_REDIRECT_URI=https://your-railway-app.railway.app/oauth2callback

# JWT Authentication
JWT_SECRET=your_strong_jwt_secret_here
REFRESH_JWT_SECRET=your_strong_refresh_jwt_secret_here

# Database
DATABASE_URL=postgresql://postgres:password@containers-us-west-xxx.railway.app:xxxxxx/railway

# Firebase Service Account (entire JSON as single line)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"newsletter-reader-app",...}
```

### 2. Generate Secrets
```bash
# Generate JWT secrets (run these commands locally)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('REFRESH_JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Google Cloud Setup
- ✅ Gmail API enabled
- ✅ Pub/Sub API enabled  
- ✅ OAuth2 credentials created
- ✅ Service account created with Editor role
- ✅ Service account JSON key downloaded

### 4. Railway Configuration Issues Fixed
- ✅ Removed conflicting nixpacksConfigPath
- ✅ Simplified build command
- ✅ Added watchPatterns for backend-only deployments
- ✅ Created proper Railway configuration

## 🔧 Common Issues & Solutions

### Build Failures
1. **Workspace Detection**: Railway now focuses on backend/ directory only
2. **Dependency Conflicts**: Using --omit=dev to reduce build size
3. **Node Version**: Railway auto-detects Node.js from backend/package.json

### Runtime Failures
1. **Missing Environment Variables**: Check Railway dashboard
2. **Database Connection**: Ensure DATABASE_URL is correctly set for Railway PostgreSQL
3. **Port Binding**: Railway automatically sets PORT variable

### Health Check Failures
1. **Endpoint**: Verify /health endpoint works locally
2. **Timeout**: 300 seconds should be sufficient for cold starts
3. **Dependencies**: Ensure all required services are running

## 📝 Deployment Steps

1. **Set Environment Variables** in Railway dashboard
2. **Deploy**: `railway up`
3. **Check Logs**: `railway logs` 
4. **Test Health**: Visit `https://your-app.railway.app/health`
5. **Update Mobile App**: Update API_URL with Railway domain

## 🚨 Quick Fixes Applied

- Removed conflicting nixpacks configuration
- Simplified railway.toml to focus on backend deployment
- Added proper build command and watch patterns
- Created environment variable checklist
- **Updated to PostgreSQL configuration** (migrated from SQLite)

Your Railway deployment should now work properly with PostgreSQL! 🎉


