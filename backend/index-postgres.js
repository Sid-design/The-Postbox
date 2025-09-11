// === NEWSLETTER READER BACKEND - POSTGRESQL VERSION ===
// Complete PostgreSQL migration from SQLite version
// All features preserved and optimized for PostgreSQL

const path = require('path')

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const express = require('express')
const { google } = require('googleapis')
const { PubSub } = require('@google-cloud/pubsub')
const { Pool } = require('pg')
const jwt = require('jsonwebtoken')
const admin = require('firebase-admin')
const compression = require('compression')

const app = express()
const port = process.env.PORT || 3000

// Trust proxy for production deployments
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Utility: show only first 6 chars of a token to avoid leaking secrets in logs
function snippet(token) {
  return token ? token.slice(0, 6) + '...' : 'null'
}

// Recursively extract HTML body from Gmail message payload
function extractHtml(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    let data = payload.body.data
    // Gmail uses web-safe base64url. Convert to standard base64.
    data = data.replace(/-/g, '+').replace(/_/g, '/')
    while (data.length % 4) data += '='
    return Buffer.from(data, 'base64').toString('utf8')
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const html = extractHtml(part)
      if (html) return html
    }
  }
  return ''
}

// Enhanced logging utility
function logAuth(level, message, data = null) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  }
  console.log(`[AUTH-${level}] ${timestamp}: ${message}`, data ? data : '')
  return logEntry
}

// Comprehensive logging utility
function logRequest(req, res, next) {
  const start = Date.now()
  const timestamp = new Date().toISOString()
  
  // Log request
  console.log(`[REQUEST] ${timestamp} ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    hasAuth: !!req.headers.authorization,
    contentType: req.get('Content-Type'),
    body: req.method !== 'GET' ? req.body : undefined
  })
  
  // Override res.end to log response
  const originalEnd = res.end
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start
    console.log(`[RESPONSE] ${timestamp} ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
    originalEnd.call(this, chunk, encoding)
  }
  
  next()
}

// Error logging utility
function logError(error, context = 'Unknown', additionalData = null) {
  const timestamp = new Date().toISOString()
  const errorInfo = {
    timestamp,
    context,
    error: error.message || error,
    stack: error.stack,
    additionalData
  }
  
  console.error(`[ERROR] ${timestamp} [${context}]:`, errorInfo)
  
  // In production, you might want to send this to a logging service
  // like Sentry, LogRocket, or your own logging endpoint
}

// Performance logging utility
function logPerformance(operation, duration, additionalData = null) {
  const timestamp = new Date().toISOString()
  console.log(`[PERFORMANCE] ${timestamp} ${operation}: ${duration}ms`, additionalData)
}

// --- FIREBASE SETUP ---
let serviceAccount

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY !== 'placeholder-set-in-dashboard') {
  // Use environment variable for production
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  } catch (error) {
    console.log('Invalid Firebase service account key format, skipping Firebase initialization')
    serviceAccount = null
  }
} else {
  // Use local file for development
  try {
    serviceAccount = require('./serviceAccountKey.json')
  } catch (error) {
    console.log('Local Firebase service account key not found, skipping Firebase initialization')
    serviceAccount = null
  }
}

if (process.env.NODE_ENV !== 'test' && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
} else if (process.env.NODE_ENV !== 'test') {
  console.log('Firebase service account not available, Firebase features will be disabled')
}

const JWT_SECRET = process.env.JWT_SECRET
const REFRESH_JWT_SECRET = process.env.REFRESH_JWT_SECRET

// --- POSTGRESQL DATABASE SETUP ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
})

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database.')
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err)
  // Don't exit in test environment
  if (process.env.NODE_ENV !== 'test') {
    process.exit(-1)
  }
})

// Initialize database tables
async function initializeDatabase() {
  // Skip database initialization in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('Skipping database initialization in test environment')
    return
  }
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        google_id TEXT UNIQUE,
        name TEXT,
        picture TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        push_notifications_enabled BOOLEAN DEFAULT true,
        google_refresh_token TEXT,
        temp_access_token TEXT,
        temp_token_expiry BIGINT,
        initial_scan_complete BOOLEAN DEFAULT false
      )
    `)

    // Create senders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS senders (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        description TEXT,
        category TEXT DEFAULT 'Other',
        list_id TEXT,
        subscriber_count INTEGER DEFAULT 0,
        featured BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        gmail_id TEXT UNIQUE,
        sender_id INTEGER REFERENCES senders(id),
        subject TEXT,
        body_html TEXT,
        received_at TIMESTAMP,
        read BOOLEAN DEFAULT false,
        archived BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        sender_id INTEGER REFERENCES senders(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sender_id)
      )
    `)

    // Create devices table for FCM tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        fcm_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    console.log('PostgreSQL database tables initialized successfully')

    // Seed newsletters after table setup (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(seedDiscoverableNewsletters, 1000);
    }
  } catch (err) {
    console.error('Error initializing PostgreSQL database:', err)
  }
}

// Seed discoverable newsletters
async function seedDiscoverableNewsletters() {
  // Skip seeding in test environment
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const newsletters = [
    // Technology
    {
      name: 'Hacker News Daily',
      email: 'daily@hackernews.example',
      description: 'Top tech stories and discussions from Hacker News community.',
      category: 'Technology',
      subscriber_count: 12500,
      featured: true
    },
    {
      name: 'The Verge',
      email: 'newsletter@theverge.com',
      description: 'Tech news that matters, delivered daily.',
      category: 'Technology',
      subscriber_count: 85000,
      featured: true
    },
    {
      name: 'TechCrunch Daily',
      email: 'daily@techcrunch.com',
      description: 'The latest technology news and startup funding information.',
      category: 'Technology',
      subscriber_count: 75000,
      featured: false
    },
    // Add more newsletters as needed...
  ]

  for (const newsletter of newsletters) {
    try {
      await pool.query(`
        INSERT INTO senders (name, email, description, category, subscriber_count, featured)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          subscriber_count = EXCLUDED.subscriber_count,
          featured = EXCLUDED.featured,
          updated_at = CURRENT_TIMESTAMP
      `, [
        newsletter.name,
        newsletter.email,
        newsletter.description,
        newsletter.category,
        newsletter.subscriber_count,
        newsletter.featured
      ])
      console.log(`✅ Newsletter ${newsletter.name} seeded/updated successfully`)
    } catch (error) {
      console.error(`❌ Error seeding newsletter ${newsletter.name}:`, error.message)
    }
  }
}

// --- AUTHENTICATION FUNCTIONS ---
async function findOrCreateUser(googleId, email) {
  try {
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    )

    if (existingUser.rows.length > 0) {
      return { ...existingUser.rows[0], isNew: false }
    }

    // Create new user
    const result = await pool.query(
      'INSERT INTO users (google_id, email, initial_scan_complete) VALUES ($1, $2, false) RETURNING *',
      [googleId, email]
    )

    return { ...result.rows[0], isNew: true }
  } catch (error) {
    console.error('Error in findOrCreateUser:', error)
    throw error
  }
}

async function findOrCreateSender(fullFromHeader, listId = null) {
  try {
    // Parse email and name from header
    let email, name
    const emailMatch = fullFromHeader.match(/<([^>]+)>/)
    if (emailMatch) {
      email = emailMatch[1].toLowerCase().trim()
      name = fullFromHeader.split('<')[0].trim().replace(/"/g, '')
    } else {
      email = fullFromHeader.trim().toLowerCase()
      name = email.split('@')[0]
    }

    if (!listId) {
      listId = name.toLowerCase().replace(/\s+/g, '')
    }

    // Check if sender exists
    const existingSender = await pool.query(
      'SELECT * FROM senders WHERE email = $1 AND COALESCE(list_id, \'\') = COALESCE($2, \'\')',
      [email, listId]
    )

    if (existingSender.rows.length > 0) {
      return existingSender.rows[0]
    }

    // Create new sender
    const result = await pool.query(
      'INSERT INTO senders (name, email, list_id) VALUES ($1, $2, $3) RETURNING *',
      [name, email, listId]
    )

    return result.rows[0]
  } catch (error) {
    console.error('Error in findOrCreateSender:', error)
    throw error
  }
}

async function findOrCreateSubscription(userId, senderId, isActive = true) {
  try {
    // Check if subscription exists
    const existing = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND sender_id = $2',
      [userId, senderId]
    )

    if (existing.rows.length > 0) {
      return existing.rows[0]
    }

    // Create new subscription
    const result = await pool.query(
      'INSERT INTO subscriptions (user_id, sender_id, is_active) VALUES ($1, $2, $3) RETURNING *',
      [userId, senderId, isActive]
    )

    return result.rows[0]
  } catch (error) {
    console.error('Error in findOrCreateSubscription:', error)
    throw error
  }
}

// Initialize database
initializeDatabase()

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Access token required' })
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' })
      }
      req.user = user
      next()
    })
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ error: 'Authentication error' })
  }
}

// --- EXPRESS APP SETUP ---
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (!req.headers['accept-encoding'] || !req.headers['accept-encoding'].includes('gzip')) {
      return false
    }
    return true
  }
}))

app.use(express.json())

// Add comprehensive logging middleware
app.use(logRequest)

// --- PUBLIC ROUTES ---
app.get('/', (req, res) => {
  res.send('Newsletter Reader Backend (PostgreSQL) is running!')
})

app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// Detailed health check endpoint
app.get('/health/detailed', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {}
    };
    
    // Check database
    try {
      const dbResult = await pool.query('SELECT COUNT(*) as count FROM users');
      health.services.database = {
        status: 'OK',
        userCount: dbResult.rows[0].count
      };
    } catch (error) {
      health.services.database = {
        status: 'ERROR',
        error: error.message
      };
    }
    
    // Check Google API (if configured)
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      health.services.googleApi = {
        status: 'CONFIGURED',
        clientId: process.env.GOOGLE_CLIENT_ID.substring(0, 20) + '...'
      };
    } else {
      health.services.googleApi = {
        status: 'NOT_CONFIGURED'
      };
    }
    
    // Check Firebase (if configured)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY !== 'placeholder-set-in-dashboard') {
      health.services.firebase = {
        status: 'CONFIGURED'
      };
    } else {
      health.services.firebase = {
        status: 'NOT_CONFIGURED'
      };
    }
    
    res.json(health);
  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  const apiDocs = {
    title: 'Newsletter Reader API',
    version: '1.0.0',
    description: 'API for managing Gmail newsletters and subscriptions',
    baseUrl: `${req.protocol}://${req.get('host')}`,
    endpoints: {
      authentication: {
        'POST /login': 'Exchange Google ID token for app JWT',
        'POST /auth/refresh': 'Refresh expired JWT token',
        'POST /auth/refresh-gmail': 'Refresh Gmail API access token'
      },
      users: {
        'GET /api/user': 'Get current user information'
      },
      messages: {
        'GET /api/messages': 'Get paginated list of messages',
        'GET /api/messages/:id': 'Get specific message by ID',
        'POST /api/messages/:id/read': 'Mark message as read',
        'POST /api/messages/:id/unread': 'Mark message as unread'
      },
      senders: {
        'GET /api/senders': 'Get list of all senders',
        'GET /api/subscriptions': 'Get user subscriptions'
      },
      subscriptions: {
        'POST /api/newsletters/subscribe': 'Subscribe to a newsletter',
        'POST /api/newsletters/unsubscribe': 'Unsubscribe from a newsletter',
        'POST /api/subscriptions/sync': 'Sync multiple subscription changes',
        'POST /subscriptions/toggle': 'Toggle subscription status'
      },
      gmail: {
        'POST /api/backfill': 'Backfill Gmail messages',
        'POST /api/trigger-initial-scan': 'Trigger initial sender scan',
        'GET /api/rescan': 'Rescan and refresh sender list'
      },
      notifications: {
        'GET /api/notification-settings': 'Get notification settings',
        'POST /notification-settings/sync': 'Sync notification settings'
      },
      devices: {
        'POST /devices': 'Register FCM device token'
      },
      health: {
        'GET /health': 'Basic health check',
        'GET /health/detailed': 'Detailed health check with service status',
        'GET /test': 'Simple connectivity test',
        'GET /debug/auth': 'Debug authentication status'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <jwt_token>',
      note: 'Most endpoints require authentication except /health, /test, /login, and /auth/refresh'
    },
    errorCodes: {
      400: 'Bad Request - Invalid input data',
      401: 'Unauthorized - Invalid or missing token',
      403: 'Forbidden - Insufficient permissions',
      404: 'Not Found - Resource not found',
      409: 'Conflict - Resource already exists or conflict detected',
      422: 'Unprocessable Entity - Validation failed',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error - Server error',
      502: 'Bad Gateway - Upstream service error',
      503: 'Service Unavailable - Service temporarily unavailable',
      504: 'Gateway Timeout - Upstream service timeout'
    }
  };
  
  res.json(apiDocs);
});

// Simple test endpoint for mobile connectivity
app.get('/test', (req, res) => {
  res.json({
    message: 'Newsletter Reader API is working!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// --- OAUTH2 SETUP ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === 'production'
    ? process.env.PRODUCTION_REDIRECT_URI || 'https://the-postbox-production.up.railway.app/oauth2callback'
    : 'http://localhost:3000/oauth2callback'
)

const iosOauth2Client = new google.auth.OAuth2(
  '493373719535-v990sc2u46lgga6nkbt962isqr7518ni.apps.googleusercontent.com',
  null,
  'com.googleusercontent.apps.493373719535-v990sc2u46lgga6nkbt962isqr7518ni'
)

const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
]

// --- AUTHENTICATION ROUTES ---
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  })
  res.redirect(authUrl)
})

app.get('/oauth2callback', async (req, res) => {
  try {
    const { code } = req.query
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' })
    }

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    }).then(res => res.json())

    console.log('[OAUTH] User info received:', userInfo)
    
    if (!userInfo.id) {
      console.error('[OAUTH] No Google ID in user info:', userInfo)
      return res.status(400).json({ error: 'No Google ID received from OAuth' })
    }

    const user = await findOrCreateUser(userInfo.id, userInfo.email)

    // Store the refresh token if we have one
    if (tokens.refresh_token) {
      console.log('[OAUTH] Storing refresh token for user:', user.id)
      await pool.query(
        'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
        [tokens.refresh_token, user.id]
      )
    } else {
      console.log('[OAUTH] No refresh token received from OAuth flow')
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const redirectUrl = `newsletterreader://auth?token=${jwtToken}`
    res.redirect(redirectUrl)
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
})

// --- PROTECTED ROUTES ---
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, email, name, picture, created_at FROM users WHERE id = $1',
      [req.user.userId]
    )
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user.rows[0])
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

app.get('/api/senders', authenticateToken, async (req, res) => {
  try {
    const senders = await pool.query(`
      SELECT s.*, COUNT(m.id) as message_count
      FROM senders s
      LEFT JOIN messages m ON s.id = m.sender_id
      GROUP BY s.id
      ORDER BY s.name
    `)
    res.json(senders.rows)
  } catch (error) {
    console.error('Error fetching senders:', error)
    res.status(500).json({ error: 'Failed to fetch senders' })
  }
})

app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const offset = (page - 1) * limit

    const messages = await pool.query(`
      SELECT m.*, s.name as sender_name, s.email as sender_email
      FROM messages m
      JOIN senders s ON m.sender_id = s.id
      ORDER BY m.received_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset])

    console.log('[API] Messages query result:', {
      rowCount: messages.rowCount,
      rowsLength: messages.rows?.length,
      sampleRow: messages.rows?.[0]
    });
    
    res.json({
      messages: messages.rows || [],
      pagination: {
        page,
        limit,
        total: messages.rowCount || 0
      }
    })
  } catch (error) {
    // Don't log database errors in test environment to avoid confusion
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error fetching messages:', error)
    }
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

app.get('/api/newsletters', async (req, res) => {
  try {
    const newsletters = await pool.query(`
      SELECT * FROM senders
      WHERE featured = true
      ORDER BY subscriber_count DESC
      LIMIT 20
    `)

    // Convert boolean featured to number for mobile app compatibility
    const formattedNewsletters = newsletters.rows.map(newsletter => ({
      ...newsletter,
      featured: newsletter.featured ? 1 : 0
    }))

    res.json(formattedNewsletters)
  } catch (error) {
    console.error('Error fetching newsletters:', error)
    res.status(500).json({ error: 'Failed to fetch newsletters' })
  }
})

// Newsletter subscription management
app.post('/api/newsletters/subscribe', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { senderId } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: 'Sender ID is required' });
    }

    // Check if sender exists
    const sender = await pool.query('SELECT * FROM senders WHERE id = $1', [senderId]);
    if (sender.rows.length === 0) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    // Check if subscription already exists
    const existingSubscription = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND sender_id = $2',
      [userId, senderId]
    );

    if (existingSubscription.rows.length > 0) {
      // Update existing subscription to active
      await pool.query(
        'UPDATE subscriptions SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND sender_id = $2',
        [userId, senderId]
      );
    } else {
      // Create new subscription
      await pool.query(
        'INSERT INTO subscriptions (user_id, sender_id, is_active) VALUES ($1, $2, true)',
        [userId, senderId]
      );
    }

    res.json({
      success: true,
      message: 'Successfully subscribed to newsletter',
      newsletter: sender.rows[0].name
    });

  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Failed to subscribe to newsletter' });
  }
});

// Unsubscribe from newsletter
app.post('/api/newsletters/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { senderId } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: 'Sender ID is required' });
    }

    // Update subscription to inactive
    const result = await pool.query(
      'UPDATE subscriptions SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND sender_id = $2',
      [userId, senderId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    });

  } catch (error) {
    console.error('Error unsubscribing from newsletter:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from newsletter' });
  }
});

// Get user's subscriptions
app.get('/api/subscriptions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const subscriptions = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.email,
        s.description,
        s.category,
        s.subscriber_count,
        s.featured,
        sub.is_active,
        sub.created_at as subscribed_at
      FROM subscriptions sub
      JOIN senders s ON sub.sender_id = s.id
      WHERE sub.user_id = $1 AND sub.is_active = true
      ORDER BY sub.created_at DESC
    `, [userId]);

    // Convert boolean featured to number for mobile app compatibility
    const formattedSubscriptions = subscriptions.rows.map(sub => ({
      ...sub,
      featured: sub.featured ? 1 : 0
    }));

    res.json(formattedSubscriptions);

  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Sync multiple subscription changes
app.post('/api/subscriptions/sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subscriptions } = req.body;

    if (!Array.isArray(subscriptions)) {
      return res.status(400).json({ error: 'Subscriptions must be an array' });
    }

    console.log(`[SUBSCRIPTIONS] Syncing ${subscriptions.length} subscription changes for user ${userId}`);

    // Process each subscription change
    for (const change of subscriptions) {
      const { senderId, isActive } = change;

      if (typeof senderId !== 'number' || typeof isActive !== 'boolean') {
        console.warn(`[SUBSCRIPTIONS] Invalid change format:`, change);
        continue;
      }

      if (isActive) {
        // Subscribe - insert or update subscription to active
        await pool.query(`
          INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
          VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, sender_id)
          DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
        `, [userId, senderId]);
      } else {
        // Unsubscribe - set subscription to inactive
        await pool.query(`
          INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
          VALUES ($1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, sender_id)
          DO UPDATE SET is_active = false, updated_at = CURRENT_TIMESTAMP
        `, [userId, senderId]);
      }
    }

    console.log(`[SUBSCRIPTIONS] Successfully synced ${subscriptions.length} changes`);
    res.json({ success: true, synced: subscriptions.length });

  } catch (error) {
    console.error('Error syncing subscriptions:', error);
    res.status(500).json({ error: 'Failed to sync subscriptions' });
  }
});

// Rescan endpoint for refreshing sender list
app.get('/api/rescan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[RESCAN] Triggering rescan for user:', userId);
    
    // Get user's refresh token
    const userResult = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const refreshToken = userResult.rows[0].google_refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token available. Please re-authenticate.' });
    }
    
    // Trigger the initial sender scan
    await initialSenderScan(userId, refreshToken);
    
    res.json({ success: true, message: 'Rescan completed successfully' });
  } catch (error) {
    console.error('Error during rescan:', error);
    res.status(500).json({ error: 'Failed to rescan senders' });
  }
});

// Notification settings endpoints
app.get('/api/notification-settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT push_notifications_enabled FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      pushNotifications: user.push_notifications_enabled,
      notificationSound: true, // Default
      notificationFrequency: 'immediate', // Default
      quietHoursEnabled: false, // Default
      quietHoursStart: '22:00', // Default
      quietHoursEnd: '08:00' // Default
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

app.post('/notification-settings/sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pushNotifications, notificationSound, notificationFrequency, quietHoursEnabled, quietHoursStart, quietHoursEnd } = req.body;
    
    await pool.query(
      'UPDATE users SET push_notifications_enabled = $1 WHERE id = $2',
      [pushNotifications, userId]
    );
    
    // Store other settings in a separate table or JSON field if needed
    // For now, just update the push notifications setting
    
    res.json({ success: true, message: 'Notification settings synced successfully' });
  } catch (error) {
    console.error('Error syncing notification settings:', error);
    res.status(500).json({ error: 'Failed to sync notification settings' });
  }
});

// Subscription toggle endpoint
app.post('/subscriptions/toggle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { senderId, isActive } = req.body;
    
    if (!senderId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    
    if (isActive) {
      // Subscribe
      await pool.query(`
        INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
        VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, sender_id)
        DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
      `, [userId, senderId]);
    } else {
      // Unsubscribe
      await pool.query(`
        INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
        VALUES ($1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, sender_id)
        DO UPDATE SET is_active = false, updated_at = CURRENT_TIMESTAMP
      `, [userId, senderId]);
    }
    
    res.json({ success: true, message: `Subscription ${isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Error toggling subscription:', error);
    res.status(500).json({ error: 'Failed to toggle subscription' });
  }
});

// Gmail refresh endpoint
app.post('/auth/refresh-gmail', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[GMAIL_REFRESH] Refreshing Gmail access for user:', userId);
    
    // Get user's refresh token
    const userResult = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const refreshToken = userResult.rows[0].google_refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token available. Please re-authenticate.' });
    }
    
    // Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    // Get new access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Store the new access token temporarily
    const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000); // 1 hour from now in seconds
    await pool.query(
      'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
      [credentials.access_token, expiryTime, userId]
    );
    
    res.json({ 
      success: true, 
      message: 'Gmail access refreshed successfully',
      accessToken: credentials.access_token
    });
  } catch (error) {
    console.error('Error refreshing Gmail access:', error);
    res.status(500).json({ error: 'Failed to refresh Gmail access' });
  }
});

// Token refresh endpoint
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // Verify the refresh token
    jwt.verify(refreshToken, REFRESH_JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }
      
      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email }, 
        JWT_SECRET, 
        { expiresIn: '15m' }
      );
      
      res.json({ 
        accessToken: newAccessToken,
        expiresIn: 900 // 15 minutes in seconds
      });
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Mobile app login endpoint - exchange Google ID token for app JWT
app.post('/login', async (req, res) => {
  try {
    const { idToken, accessToken, authCode } = req.body;

    // For mobile OAuth2 flow, we can use the access token directly
    // Store it temporarily for Gmail API access
    if (accessToken) {
      logAuth('INFO', 'Access token received from mobile app', {
        accessTokenLength: accessToken.length,
        accessTokenSnippet: snippet(accessToken)
      });
    }

    logAuth('INFO', 'Login attempt started', {
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
      hasAuthCode: !!authCode,
      authCodeLength: authCode ? authCode.length : 0,
      securityNote: 'PKCE enabled for enhanced mobile security'
    });

    if (!idToken) {
      logAuth('ERROR', 'Missing Google ID token');
      return res.status(400).json({ error: 'Missing Google ID token.' });
    }

    // Verify the Google ID token
    logAuth('INFO', 'Verifying Google ID token...');
    const ticket = await oauth2Client.verifyIdToken({
        idToken: idToken,
        audience: [
          '493373719535-68sbv92kmtnvujjclqja8bkt6kc0i8bs.apps.googleusercontent.com', // Web client ID
          '493373719535-v990sc2u46lgga6nkbt962isqr7518ni.apps.googleusercontent.com'  // iOS client ID
        ],
    });
    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];

    logAuth('INFO', 'ID token verified successfully', { googleId, email });

    if (!googleId || !email) {
      logAuth('ERROR', 'Invalid Google token: missing googleId or email', { googleId, email });
      return res.status(400).json({ error: 'Invalid Google token: missing googleId or email.' });
    }

    const user = await findOrCreateUser(googleId, email);
    logAuth('INFO', 'User found/created', { userId: user.id, email: user.email });

    // Store the access token temporarily for immediate Gmail API access
    if (accessToken) {
      logAuth('INFO', 'Storing access token for immediate Gmail API access', { userId: user.id });

      const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000); // 1 hour from now in seconds
      
      await pool.query(
        'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
        [accessToken, expiryTime, user.id] // 1 hour expiry (Unix timestamp)
      );

      logAuth('SUCCESS', 'Access token stored for Gmail API access', { userId: user.id });
    }

    // For mobile OAuth2 flow, we need to handle refresh tokens properly
    let refreshToken = null;

    // Check if user already has a refresh token from a previous successful exchange
    logAuth('INFO', 'Checking for existing refresh token', { userId: user.id });
    const existingUser = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [user.id]
    );

    if (existingUser.rows.length > 0 && existingUser.rows[0].google_refresh_token) {
      logAuth('INFO', 'User already has a refresh token from previous login', { userId: user.id, hasRefreshToken: true });
      refreshToken = existingUser.rows[0].google_refresh_token;
    } else {
      // Attempt to get a refresh token using the authorization code
      if (authCode) {
        try {
          logAuth('INFO', 'Attempting to exchange authorization code for refresh token', {
            userId: user.id,
            authCodeSnippet: snippet(authCode)
          });

          // For mobile apps, we need to handle the OAuth2 flow carefully
          const tokenResponse = await oauth2Client.getToken(authCode);
          refreshToken = tokenResponse.tokens.refresh_token;

          if (refreshToken) {
            logAuth('SUCCESS', 'Refresh token obtained successfully via OAuth2 exchange', {
              refreshTokenSnippet: snippet(refreshToken),
              userId: user.id,
              hasRefreshToken: true
            });

            // Store the refresh token for future use
            await pool.query(
              'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
              [refreshToken, user.id]
            );

            logAuth('SUCCESS', 'Refresh token saved to database for long-term access', { userId: user.id });
          } else {
            logAuth('WARN', 'No refresh token received from OAuth2 exchange - will use access token', {
              userId: user.id,
              hasRefreshToken: false
            });
          }
        } catch (error) {
          // For mobile OAuth2 flow, this is often expected since the mobile app
          // may have already exchanged the authorization code
          if (error.message.includes('invalid_grant') || error.message.includes('Code was already redeemed')) {
            logAuth('INFO', 'Authorization code already used by mobile app - using access token', {
              userId: user.id
            });
          } else {
            logAuth('WARN', 'OAuth2 token exchange failed unexpectedly', {
              userId: user.id,
              error: error.message
            });
          }

          // Don't fail the login - we'll use the access token
          // The refresh token can be obtained in a future login
        }
      } else {
        logAuth('INFO', 'No authorization code provided - using access token only', {
          userId: user.id
        });
      }
    }

    // Log final refresh token status
    logAuth('INFO', 'Login process completed', { 
      userId: user.id, 
      hasRefreshToken: !!refreshToken,
      refreshTokenSource: refreshToken ? 'existing_or_new' : 'none'
    });

    // If this is the first time and we have a refresh token, trigger the initial sender scan
    if (!user.initial_scan_complete && refreshToken) {
      logAuth('INFO', 'Initial scan not completed, starting scan with refresh token', { userId: user.id });
      const authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      authClient.setCredentials({ refresh_token: refreshToken });

      // Test the token and trigger initial scan
      try {
        await authClient.getAccessToken();
        logAuth('SUCCESS', 'Refresh token validated, triggering initial scan', { userId: user.id });
        initialSenderScan(user.id, authClient).catch(err => {
          logAuth('ERROR', 'Error during initial sender scan', { error: err.message, userId: user.id });
        });
      } catch (error) {
        logAuth('ERROR', 'Failed to authenticate with refresh token for initial scan', {
          error: error.message,
          userId: user.id
        });
      }
    } else if (!refreshToken) {
      logAuth('WARN', 'No refresh token available for initial scan', {
        userId: user.id,
        initialScanComplete: user.initial_scan_complete
      });
    }

    // Create our app-specific JWTs
    const appToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    const refreshTokenJwt = jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_JWT_SECRET, { expiresIn: '90d' });
    logAuth('SUCCESS', 'Login completed successfully', {
      userId: user.id,
      hasRefreshToken: !!refreshToken,
      tokenSnippet: snippet(appToken)
    });

    // The mobile app expects the key to be "token"; include refresh token for silent renewals
    res.json({ token: appToken, refreshToken: refreshTokenJwt, expiresIn: 900 });
  } catch (error) {
    logAuth('ERROR', 'Error during login', {
      error: error.message,
      errorStack: error.stack
    });
    res.status(500).json({ error: 'Login failed.' });
  }
});

// --- ERROR HANDLING ---
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

// --- GMAIL HELPER FUNCTIONS ---

// Extract sender email from Gmail headers (newsletter detection)
function getSenderFromHeaders(headers) {
  const hasListUnsubscribe = headers.some(
    h => h.name.toLowerCase() === 'list-unsubscribe'
  );

  const isBulk = headers.some(
    h => h.name.toLowerCase() === 'precedence' && h.value.toLowerCase() === 'bulk'
  );

  if (hasListUnsubscribe || isBulk) {
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
    return fromHeader ? fromHeader.value : null;
  }
  return null;
}

// Find or create sender in PostgreSQL
async function findOrCreateSender(fullFromHeader, listId = null) {
  try {
    // Parse the email address and name from the full 'From' header
    let email;
    let name;
    const emailMatch = fullFromHeader.match(/<([^>]+)>/);
    if (emailMatch) {
      email = emailMatch[1].toLowerCase().trim();
      // Clean up the name part
      name = fullFromHeader.split('<')[0].trim().replace(/"/g, '');
    } else {
      email = fullFromHeader.trim().toLowerCase();
      name = email.split('@')[0]; // Simple fallback for name
    }

    // Derive fallback listId from name when absent
    if (!listId) {
      listId = name.toLowerCase().replace(/\s+/g, '');
    }

    // Check if this sender already exists (email + listId)
    const query = `SELECT * FROM senders WHERE email = $1 AND COALESCE(list_id,'') = COALESCE($2, '')`;
    const result = await pool.query(query, [email, listId]);
    
    if (result.rows.length > 0) {
      return result.rows[0]; // It exists, return it
    }

    // Create new sender
    const insertQuery = `
      INSERT INTO senders (name, email, list_id, created_at, updated_at) 
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
      RETURNING *
    `;
    const insertResult = await pool.query(insertQuery, [name, email, listId]);
    return insertResult.rows[0];
  } catch (error) {
    console.error('Error in findOrCreateSender:', error);
    throw error;
  }
}

// Save message to PostgreSQL
async function saveMessage(senderId, gmailId, subject, bodyHtml, dateIso = null) {
  try {
    const query = `
      INSERT INTO messages (sender_id, gmail_id, subject, body_html, received_at, is_read) 
      VALUES ($1, $2, $3, $4, $5, FALSE)
      ON CONFLICT (gmail_id) DO NOTHING
      RETURNING id
    `;
    
    // Normalize date input to a valid ISO string
    const normalizeDate = (val) => {
      if (!val) return new Date();
      const num = Number(val);
      if (!isNaN(num)) {
        const millis = num < 1e12 ? num * 1000 : num;
        const d = new Date(millis);
        return isNaN(d.getTime()) ? new Date() : d;
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const received = normalizeDate(dateIso).toISOString();
    const result = await pool.query(query, [senderId, gmailId, subject, bodyHtml, received]);
    
    // Return true if a new row was inserted, false if it already existed
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error in saveMessage:', error);
    throw error;
  }
}

// Recursively extract HTML body from Gmail message payload
function extractHtml(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    let data = payload.body.data;
    // Gmail uses web-safe base64url. Convert to standard base64.
    data = data.replace(/-/g, '+').replace(/_/g, '/');
    while (data.length % 4) data += '=';
    return Buffer.from(data, 'base64').toString('utf8');
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const html = extractHtml(part);
      if (html) return html;
    }
  }
  return '';
}

// --- INITIAL SENDER SCAN FUNCTION ---
async function initialSenderScan(userId, authClient) {
  try {
    console.log('[INITIAL_SCAN] Fetching recent messages for initial scan...');
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // A set to collect unique sender email addresses
    const uniqueSenders = new Set();

    // First, list messages to get their IDs
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 300, // Scan a larger number of recent emails
    });

    if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
      console.log('[INITIAL_SCAN] No recent messages found for initial scan.');
      return;
    }

    // Process messages in batches to avoid overwhelming the API
    for (let i = 0; i < listResponse.data.messages.length; i += 20) {
      const batch = listResponse.data.messages.slice(i, i + 20);
      const promises = batch.map(async msg => {
        try {
          const msgDetails = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata', // We only need headers for this
            metadataHeaders: ['From', 'List-Unsubscribe'],
          });
          const sender = getSenderFromHeaders(msgDetails.data.payload.headers);
          if (sender) {
            uniqueSenders.add(sender);
          }
        } catch (e) {
          // Ignore individual message errors
        }
      });
      await Promise.all(promises);
      console.log(`[INITIAL_SCAN] Processed batch ${i / 20 + 1}... Found ${uniqueSenders.size} unique senders so far.`);
    }

    console.log(`[INITIAL_SCAN] Scan complete. Found ${uniqueSenders.size} unique newsletter senders.`);

    // Now, populate the database
    for (const senderEmail of uniqueSenders) {
      const sender = await findOrCreateSender(senderEmail, null);
      if (sender) {
        // This will create a new subscription, defaulted to ACTIVE
        await findOrCreateSubscription(userId, sender.id, true);
      }
    }

    // Mark initial scan as complete
    await pool.query(
      'UPDATE users SET initial_scan_complete = true WHERE id = $1',
      [userId]
    );

    console.log('[INITIAL_SCAN] Initial scan completed successfully');
  } catch (error) {
    console.error('[INITIAL_SCAN] Error during initial scan:', error);
    throw error;
  }
}

// --- GMAIL BACKFILL ENDPOINT ---
app.post('/api/backfill', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[BACKFILL] Starting Gmail backfill for user:', userId);
    
    // Get user's refresh token
    const userResult = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const refreshToken = userResult.rows[0].google_refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token available. Please re-authenticate.' });
    }
    
    // Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get active subscriptions for this user
    const subscriptionsResult = await pool.query(`
      SELECT s.email 
      FROM subscriptions sub 
      JOIN senders s ON sub.sender_id = s.id 
      WHERE sub.user_id = $1 AND sub.is_active = true
    `, [userId]);
    
    const activeSubscriptions = subscriptionsResult.rows.map(row => row.email);
    
    if (activeSubscriptions.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No active subscriptions found. Please subscribe to some newsletters first.',
        messagesFound: 0
      });
    }
    
    // Construct Gmail search query for the last 7 days from these senders
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const formattedDate = sevenDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const fromQueries = activeSubscriptions.map(email => `from:(${email})`).join(' OR ');
    const searchQuery = `(${fromQueries}) after:${formattedDate}`;
    
    console.log(`[BACKFILL] Gmail search query: ${searchQuery}`);
    
    // Search Gmail
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 100, // Limit to 100 recent messages for performance
    });
    
    const messages = listResponse.data.messages;
    if (!messages || messages.length === 0) {
      console.log('[BACKFILL] No messages found for backfill.');
      return res.json({ 
        success: true, 
        message: 'No new messages found in the last 7 days.',
        messagesFound: 0
      });
    }
    
    // Process and save each found message
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const msg of messages) {
      try {
        const msgDetails = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });
        
        const senderEmail = getSenderFromHeaders(msgDetails.data.payload.headers);
        const listIdHeader = msgDetails.data.payload.headers.find(h => h.name.toLowerCase() === 'list-id');
        const listId = listIdHeader ? listIdHeader.value.toLowerCase().trim() : null;
        
        if (senderEmail) {
          const sender = await findOrCreateSender(senderEmail, listId);
          const subject = msgDetails.data.payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject';
          const bodyHtml = extractHtml(msgDetails.data.payload);
          
          // Save message (will skip if already exists due to gmail_id unique constraint)
          const wasImported = await saveMessage(sender.id, msg.id, subject, bodyHtml, msgDetails.data.internalDate);
          if (wasImported) {
            importedCount++;
          } else {
            skippedCount++;
          }
        }
      } catch (error) {
        console.error(`[BACKFILL] Error processing message ${msg.id}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`[BACKFILL] Complete. Imported: ${importedCount}, Skipped: ${skippedCount}`);
    
    res.json({ 
      success: true, 
      message: `Backfill complete. Found ${messages.length} messages, imported ${importedCount} new ones.`,
      messagesFound: messages.length,
      importedCount,
      skippedCount
    });
    
  } catch (error) {
    console.error('[BACKFILL] Error during backfill:', error);
    res.status(500).json({ error: 'Backfill failed: ' + error.message });
  }
});

// --- INDIVIDUAL MESSAGE ENDPOINTS ---
app.get('/api/messages/:id', authenticateToken, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT m.*, s.name as sender_name, s.email as sender_email
      FROM messages m
      JOIN senders s ON m.sender_id = s.id
      WHERE m.id = $1
    `, [messageId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    const message = result.rows[0];
    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

app.post('/api/messages/:id/read', authenticateToken, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user.userId;
    
    await pool.query(
      'UPDATE messages SET is_read = true WHERE id = $1',
      [messageId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

app.post('/api/messages/:id/unread', authenticateToken, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = req.user.userId;
    
    await pool.query(
      'UPDATE messages SET is_read = false WHERE id = $1',
      [messageId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as unread:', error);
    res.status(500).json({ error: 'Failed to mark message as unread' });
  }
});

// --- TRIGGER INITIAL SCAN ENDPOINT ---
app.post('/api/trigger-initial-scan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[TRIGGER_SCAN] Manually triggering initial scan for user:', userId);
    
    // Get user's refresh token
    const userResult = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const refreshToken = userResult.rows[0].google_refresh_token;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token available. Please re-authenticate.' });
    }
    
    // Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    // Run the initial scan
    await initialSenderScan(userId, oauth2Client);
    
    res.json({ 
      success: true, 
      message: 'Initial scan completed successfully' 
    });
    
  } catch (error) {
    console.error('[TRIGGER_SCAN] Error during initial scan:', error);
    res.status(500).json({ error: 'Initial scan failed: ' + error.message });
  }
});

// --- DEBUG AUTH ENDPOINT ---
app.get('/debug/auth', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userResult = await pool.query(
      'SELECT id, email, google_id, initial_scan_complete, google_refresh_token FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    res.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      googleId: user.google_id,
      initialScanComplete: user.initial_scan_complete,
      hasRefreshToken: !!user.google_refresh_token
    });
    
  } catch (error) {
    console.error('Error in debug auth:', error);
    res.status(500).json({ error: 'Debug auth failed' });
  }
});

// --- DEVICE REGISTRATION ENDPOINT ---
app.post('/devices', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body
    const userId = req.user.userId

    if (!fcmToken) {
      return res.status(400).json({ error: 'FCM token is required' })
    }

    // Check if device already exists
    const existingDevice = await pool.query(
      'SELECT id FROM devices WHERE fcm_token = $1',
      [fcmToken]
    )

    if (existingDevice.rows.length > 0) {
      // Update existing device
      await pool.query(
        'UPDATE devices SET user_id = $1, created_at = CURRENT_TIMESTAMP WHERE fcm_token = $2',
        [userId, fcmToken]
      )
    } else {
      // Insert new device
      await pool.query(
        'INSERT INTO devices (user_id, fcm_token) VALUES ($1, $2)',
        [userId, fcmToken]
      )
    }

    res.json({ success: true, message: 'Device registered successfully' })
  } catch (error) {
    console.error('Error registering device:', error)
    res.status(500).json({ error: 'Failed to register device' })
  }
})

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Newsletter Reader Backend (PostgreSQL) listening on port ${PORT}`)
})

// Export for testing
module.exports = { app, pool }


