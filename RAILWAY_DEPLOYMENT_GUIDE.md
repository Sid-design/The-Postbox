# Railway Deployment Guide for Newsletter Reader

## Required Environment Variables

You need to set these environment variables in your Railway project dashboard:

### Core Application Variables
```
NODE_ENV=production
PORT=3000
```

### Google OAuth2 & Gmail API
```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
PRODUCTION_REDIRECT_URI=https://your-railway-app.railway.app/oauth2callback
```

### JWT Authentication
```
JWT_SECRET=your_strong_jwt_secret_here
REFRESH_JWT_SECRET=your_strong_refresh_jwt_secret_here
```

### Database Configuration
```
DATABASE_URL=postgresql://postgres:password@containers-us-west-xxx.railway.app:xxxxxx/railway
```

### Firebase Configuration
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"..."}
```
*Note: This should be the entire JSON content of your serviceAccountKey.json file as a single line string.*

## Setup Instructions

### 1. Deploy to Railway

1. **Connect your repository to Railway:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login to Railway
   railway login
   
   # Initialize in your project directory
   railway init
   
   # Deploy
   railway up
   ```

2. **Set Environment Variables:**
   Go to your Railway project dashboard and set all the environment variables listed above.

### 2. Generate Secrets

For JWT secrets, use strong random strings:
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate REFRESH_JWT_SECRET  
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Google Cloud Setup

1. **Enable Gmail API:**
   - Go to Google Cloud Console
   - Enable Gmail API and Pub/Sub API
   - Create OAuth2 credentials
   - Add your Railway app URL to authorized redirect URIs

2. **Set up Pub/Sub for real-time notifications:**
   - Create a topic: `gmail-push-notifications`
   - Create a subscription: `gmail-push-subscription`
   - Configure webhook endpoint: `https://your-railway-app.railway.app/webhook/gmail`

### 4. Firebase Setup

1. **Upload Service Account Key:**
   - Your `serviceAccountKey.json` file needs to be available to the app
   - Consider using Railway's file storage or environment variable for the JSON content

## Important Notes

- Your app is configured to use `newsletter-reader-app` as the Google Cloud Project ID
- **PostgreSQL database** will be created automatically on first run
- Health check endpoint is available at `/health`
- The app is configured with trust proxy for Railway's infrastructure
- **PostgreSQL** is used instead of SQLite for better production scalability

## Verification

After deployment, test these endpoints:
- `https://your-app.railway.app/` - Should show "Newsletter Reader Backend (PostgreSQL) is running!"
- `https://your-app.railway.app/health` - Should return "ok"
- `https://your-app.railway.app/api/newsletters` - Should return featured newsletters data
