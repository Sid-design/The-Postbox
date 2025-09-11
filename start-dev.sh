#!/bin/bash
# Development startup script for Newsletter Reader

echo "🚀 Starting Newsletter Reader Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Start PostgreSQL container
echo "🐘 Starting PostgreSQL container..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose exec postgres pg_isready -U postgres -d newsletter_dev > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

# Set environment variables for local development
export NODE_ENV=development
export PORT=3000
export DATABASE_URL=postgresql://postgres:devpassword@localhost:5432/newsletter_dev
export JWT_SECRET=PgVGoUMJgczHcW3ULjMm4mQ6f6XaSSzsL87TVsY4l2I=
export REFRESH_JWT_SECRET=eo0NR7cpiKFM7hk3NA/ACpdZtU84mMifcNaGb+Ad9Z4=
export GOOGLE_CLIENT_ID=493373719535-68sbv92kmtnvujjclqja8bkt6kc0i8bs.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=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
export PRODUCTION_REDIRECT_URI=http://localhost:3000/oauth2callback
export FIREBASE_SERVICE_ACCOUNT_KEY=./serviceAccountKey.json

echo "🔧 Environment variables set for local development"

# Start the backend server
echo "🖥️  Starting backend server..."
cd backend && node index-postgres.js
