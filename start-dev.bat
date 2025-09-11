@echo off
REM Development startup script for Newsletter Reader (Windows)

echo 🚀 Starting Newsletter Reader Development Environment...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Start PostgreSQL container
echo 🐘 Starting PostgreSQL container...
docker-compose up -d postgres

REM Wait for PostgreSQL to be ready
echo ⏳ Waiting for PostgreSQL to be ready...
:wait_for_postgres
docker-compose exec postgres pg_isready -U postgres -d newsletter_dev >nul 2>&1
if %errorlevel% neq 0 (
    echo    Waiting for PostgreSQL...
    timeout /t 2 /nobreak >nul
    goto wait_for_postgres
)

echo ✅ PostgreSQL is ready!

REM Set environment variables for local development
set NODE_ENV=development
set PORT=3000
set DATABASE_URL=postgresql://postgres:devpassword@localhost:5432/newsletter_dev
set JWT_SECRET=PgVGoUMJgczHcW3ULjMm4mQ6f6XaSSzsL87TVsY4l2I=
set REFRESH_JWT_SECRET=eo0NR7cpiKFM7hk3NA/ACpdZtU84mMifcNaGb+Ad9Z4=
set GOOGLE_CLIENT_ID=493373719535-68sbv92kmtnvujjclqja8bkt6kc0i8bs.apps.googleusercontent.com
set GOOGLE_CLIENT_SECRET=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
set PRODUCTION_REDIRECT_URI=http://localhost:3000/oauth2callback
set FIREBASE_SERVICE_ACCOUNT_KEY=./serviceAccountKey.json

echo 🔧 Environment variables set for local development

REM Start the backend server
echo 🖥️  Starting backend server...
cd backend
node index-postgres.js
