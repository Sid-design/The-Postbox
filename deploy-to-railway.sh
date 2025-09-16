#!/bin/bash

echo "🚂 Railway Deployment Script for Newsletter Reader"
echo "=================================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo "🔐 Please log in to Railway..."
    railway login
fi

# Initialize Railway project if not exists
if [ ! -f "railway.toml" ]; then
    echo "📝 Initializing Railway project..."
    railway init
fi

echo "🔧 Checking environment variables..."

# List of required environment variables
required_vars=(
    "NODE_ENV"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "JWT_SECRET"
    "REFRESH_JWT_SECRET"
    "FIREBASE_SERVICE_ACCOUNT_KEY"
)

echo "⚠️  Make sure you have set these environment variables in Railway:"
for var in "${required_vars[@]}"; do
    echo "   - $var"
done

echo ""
echo "🌐 Your Railway app URL will be something like:"
echo "   https://newsletter-reader-production.up.railway.app"
echo ""
echo "📱 Don't forget to update the mobile app's API_URL if needed!"
echo ""

read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying to Railway..."
    railway up
    
    echo ""
    echo "✅ Deployment complete!"
    echo "🔗 Check your Railway dashboard for the app URL"
    echo "📋 Verify the deployment by visiting /health endpoint"
else
    echo "❌ Deployment cancelled"
fi






