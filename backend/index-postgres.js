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
  process.exit(-1)
})

// Initialize database tables
async function initializeDatabase() {
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

    // Seed newsletters after table setup
    setTimeout(seedDiscoverableNewsletters, 1000)
  } catch (err) {
    console.error('Error initializing PostgreSQL database:', err)
  }
}

// Seed discoverable newsletters
async function seedDiscoverableNewsletters() {
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
      `, [
        newsletter.name,
        newsletter.email,
        newsletter.description,
        newsletter.category,
        newsletter.subscriber_count,
        newsletter.featured
      ])
    } catch (error) {
      console.error(`Error seeding newsletter ${newsletter.name}:`, error)
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

// --- PUBLIC ROUTES ---
app.get('/', (req, res) => {
  res.send('Newsletter Reader Backend (PostgreSQL) is running!')
})

app.get('/health', (req, res) => {
  res.status(200).send('ok')
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

const scopes = ['https://www.googleapis.com/auth/gmail.readonly']

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

    const user = await findOrCreateUser(userInfo.id, userInfo.email)

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

    res.json({
      messages: messages.rows,
      pagination: {
        page,
        limit,
        total: messages.rowCount
      }
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
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
    res.json(newsletters.rows)
  } catch (error) {
    console.error('Error fetching newsletters:', error)
    res.status(500).json({ error: 'Failed to fetch newsletters' })
  }
})

// --- ERROR HANDLING ---
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Newsletter Reader Backend (PostgreSQL) listening on port ${PORT}`)
})

// Export for testing
module.exports = { app, pool }


