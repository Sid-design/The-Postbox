@echo off
echo 🚂 Railway Deployment Script for Newsletter Reader
echo ==================================================

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Railway CLI not found. Installing...
    npm install -g @railway/cli
)

REM Check if logged in to Railway
railway whoami >nul 2>&1
if errorlevel 1 (
    echo 🔐 Please log in to Railway...
    railway login
)

REM Initialize Railway project if not exists
if not exist "railway.toml" (
    echo 📝 Initializing Railway project...
    railway init
)

echo 🔧 Checking environment variables...

echo ⚠️  Make sure you have set these environment variables in Railway:
echo    - NODE_ENV
echo    - GOOGLE_CLIENT_ID
echo    - GOOGLE_CLIENT_SECRET
echo    - JWT_SECRET
echo    - REFRESH_JWT_SECRET
echo    - FIREBASE_SERVICE_ACCOUNT_KEY

echo.
echo 🌐 Your Railway app URL will be something like:
echo    https://newsletter-reader-production.up.railway.app
echo.
echo 📱 Don't forget to update the mobile app's API_URL if needed!
echo.

set /p continue="Continue with deployment? (y/N): "
if /i "%continue%"=="y" (
    echo 🚀 Deploying to Railway...
    railway up
    
    echo.
    echo ✅ Deployment complete!
    echo 🔗 Check your Railway dashboard for the app URL
    echo 📋 Verify the deployment by visiting /health endpoint
) else (
    echo ❌ Deployment cancelled
)

pause






