// === NEWSLETTER READER BACKEND - POSTGRESQL VERSION ===
// Production-ready PostgreSQL backend with all features
// Optimized for scalability and performance

const path = require('path')

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// --- SENTRY (must be initialised before everything else) ---
const Sentry = require('@sentry/node')
Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.NODE_ENV || 'development',
  // Only active when SENTRY_DSN is set (empty string disables it)
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})

const express = require('express')
const { google } = require('googleapis')
const { PubSub } = require('@google-cloud/pubsub')
const { Pool } = require('pg')
const jwt = require('jsonwebtoken')
const admin = require('firebase-admin')
const compression = require('compression')
const { Expo } = require('expo-server-sdk')

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

// --- STRUCTURED LOGGING (Pino) ---
// All log output is JSON so Fly.io / any log aggregator can filter by field.
// Use LOG_LEVEL env var to change verbosity (default: 'info').
// In local dev you can pipe output through `pino-pretty` for readable output:
//   node index-postgres.js | npx pino-pretty
const pino = require('pino')
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'the-postbox-backend' },
})

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

// Auth event logging — keeps existing call signature throughout the file
function logAuth(level, message, data = null) {
  const pinoLevel = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'
  logger[pinoLevel]({ auth: true, data }, `[AUTH] ${message}`)
}

// HTTP request logging middleware — only logs errors (4xx/5xx) and slow requests
function logRequest(req, res, next) {
  const start = Date.now()
  const originalEnd = res.end
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start
    if (res.statusCode >= 400 || duration > 1000) {
      const level = res.statusCode >= 500 ? 'error' : 'warn'
      logger[level]({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      }, `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`)
    }
    originalEnd.call(this, chunk, encoding)
  }
  next()
}

// Error logging — keeps existing call signature throughout the file
function logError(error, context = 'Unknown', additionalData = null) {
  logger.error({
    err: { message: error.message || String(error), stack: error.stack },
    context,
    additionalData,
  }, `[ERROR] ${context}: ${error.message || error}`)
  // Also report to Sentry when active
  Sentry.captureException(error, { extra: { context, additionalData } })
}

// Performance logging — keeps existing call signature throughout the file
function logPerformance(operation, duration, additionalData = null) {
  logger.info({ operation, durationMs: duration, additionalData }, `[PERF] ${operation}: ${duration}ms`)
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

// Seed discoverable newsletters (run once)
async function seedDiscoverableNewsletters() {
  const newsletters = [
    // Technology
    {
      name: 'Hacker News Daily',
      email: 'daily@hackernews.example',
      list_id: 'daily',
      description: 'Top tech stories and discussions from Hacker News community. Stay updated with the latest in programming, startups, and technology trends.',
      category: 'Technology',
      subscriber_count: 12500,
      featured: true
    },
    {
      name: 'The Verge',
      email: 'newsletter@theverge.com',
      list_id: 'newsletter',
      description: 'Tech news that matters, delivered daily. From the latest gadgets to major industry shifts, we cover what\'s important in technology.',
      category: 'Technology',
      subscriber_count: 85000,
      featured: true
    },
    {
      name: 'MIT Technology Review',
      email: 'daily@technologyreview.com',
      list_id: 'daily',
      description: 'Insights from MIT on emerging technologies. Deep dives into AI, biotech, climate tech, and the future of innovation.',
      category: 'Technology',
      subscriber_count: 45000,
      featured: true
    },
    {
      name: 'TechCrunch Daily',
      email: 'daily@techcrunch.com',
      list_id: 'daily',
      description: 'The latest technology news and startup funding information, delivered fresh every morning.',
      category: 'Technology',
      subscriber_count: 75000,
      featured: false
    },
    {
      name: 'Wired Daily',
      email: 'daily@wired.com',
      list_id: 'daily',
      description: 'Where tomorrow is realized. Get the latest in science, culture, and technology from WIRED.',
      category: 'Technology',
      subscriber_count: 92000,
      featured: false
    },

    // Business & Finance
    {
      name: 'Morning Brew',
      email: 'morning@morningbrew.com',
      list_id: 'morning',
      description: 'Business news and insights you can read in 5 minutes. The smartest (and fastest) digest of business news.',
      category: 'Business',
      subscriber_count: 120000,
      featured: true
    },
    {
      name: 'The Hustle',
      email: 'daily@thehustle.co',
      list_id: 'daily',
      description: 'Smart, entertaining business news. Stories about money, entrepreneurship, and the economy that matter.',
      category: 'Business',
      subscriber_count: 95000,
      featured: true
    },
    {
      name: 'Business Insider Daily',
      email: 'daily@businessinsider.com',
      list_id: 'daily',
      description: 'Breaking business news and financial information, plus analysis of markets and companies.',
      category: 'Business',
      subscriber_count: 110000,
      featured: false
    },
    {
      name: 'Seeking Alpha',
      email: 'market@seekingalpha.com',
      list_id: 'market',
      description: 'Stock market analysis and investment research. Get expert insights on stocks, ETFs, and market trends.',
      category: 'Business',
      subscriber_count: 65000,
      featured: false
    },

    // Design & Creativity
    {
      name: 'Creative Bloq',
      email: 'newsletter@creativebloq.com',
      list_id: 'newsletter',
      description: 'Design inspiration and tutorials for creatives. Learn new skills and stay inspired with design trends.',
      category: 'Design',
      subscriber_count: 78000,
      featured: false
    },
    {
      name: 'Smashing Magazine',
      email: 'newsletter@smashingmagazine.com',
      list_id: 'newsletter',
      description: 'Helping you master web development and design. Tips, techniques, and best practices for modern web design.',
      category: 'Design',
      subscriber_count: 68000,
      featured: false
    },
    {
      name: 'Dribbble Daily',
      email: 'daily@dribbble.com',
      list_id: 'daily',
      description: 'The best design work from around the world. Daily inspiration from the world\'s top designers.',
      category: 'Design',
      subscriber_count: 45000,
      featured: false
    },

    // Science & Education
    {
      name: 'Science Daily',
      email: 'newsletter@sciencedaily.com',
      list_id: 'newsletter',
      description: 'Latest research news and scientific discoveries. Stay informed about breakthroughs in science and technology.',
      category: 'Science',
      subscriber_count: 156000,
      featured: true
    },
    {
      name: 'Quanta Magazine',
      email: 'weekly@quantamagazine.org',
      list_id: 'weekly',
      description: 'Illuminating mathematics, physics, biology and computer science research. Making complex science accessible.',
      category: 'Science',
      subscriber_count: 35000,
      featured: false
    },
    {
      name: 'The Scientist',
      email: 'newsletter@the-scientist.com',
      list_id: 'newsletter',
      description: 'Life science news and commentary. Keep up with the latest research and trends in biological sciences.',
      category: 'Science',
      subscriber_count: 28000,
      featured: false
    },

    // Health & Wellness
    {
      name: 'Well+Good',
      email: 'newsletter@wellandgood.com',
      list_id: 'newsletter',
      description: 'Health, wellness, and lifestyle tips. Your guide to living your healthiest, happiest life.',
      category: 'Health',
      subscriber_count: 89000,
      featured: false
    },
    {
      name: 'Healthline',
      email: 'newsletter@healthline.com',
      list_id: 'newsletter',
      description: 'Trusted medical information and health advice. Evidence-based health content you can rely on.',
      category: 'Health',
      subscriber_count: 134000,
      featured: false
    },

    // Sports & Gaming
    {
      name: 'ESPN Daily',
      email: 'daily@espn.com',
      list_id: 'daily',
      description: 'The latest sports news, scores, and analysis from ESPN. Your daily sports briefing.',
      category: 'Sports',
      subscriber_count: 180000,
      featured: false
    },
    {
      name: 'IGN Daily',
      email: 'daily@ign.com',
      list_id: 'daily',
      description: 'Video game news, reviews, and entertainment. The latest in gaming culture and industry news.',
      category: 'Entertainment',
      subscriber_count: 95000,
      featured: false
    },

    // Politics & News
    {
      name: 'Politico Playbook',
      email: 'playbook@politico.com',
      list_id: 'playbook',
      description: 'The most influential newsletter in politics. Morning must-reads from Washington insiders.',
      category: 'Politics',
      subscriber_count: 42000,
      featured: false
    },
    {
      name: 'The New York Times Daily',
      email: 'daily@nytimes.com',
      list_id: 'daily',
      description: 'All the news that\'s fit to print. Comprehensive coverage of news, politics, and culture.',
      category: 'Politics',
      subscriber_count: 210000,
      featured: false
    }
  ];

  for (const newsletter of newsletters) {
    try {
      await pool.query(`
        INSERT INTO senders (name, email, list_id, description, category, subscriber_count, featured, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email, list_id) DO NOTHING
      `, [
        newsletter.name,
        newsletter.email,
        newsletter.list_id || 'default',
        newsletter.description,
        newsletter.category,
        newsletter.subscriber_count,
        newsletter.featured
      ]);
    } catch (error) {
      console.error('Error seeding newsletter:', newsletter.name, error.message);
    }
  }
}

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
    // NOTE: list_id + the discovery columns (description/category/subscriber_count/
    // featured) are REQUIRED by findOrCreateSender and the /api/newsletters &
    // /discover endpoints. They were historically missing from this CREATE TABLE,
    // which broke subscription import and discovery on existing databases. A
    // migration below (ADD COLUMN IF NOT EXISTS) repairs older databases.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS senders (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        list_id TEXT,
        description TEXT,
        category TEXT,
        subscriber_count INTEGER DEFAULT 0,
        featured BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES senders(id) ON DELETE CASCADE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES senders(id) ON DELETE CASCADE,
        gmail_id TEXT UNIQUE NOT NULL,
        subject TEXT,
        body_html TEXT,
        received_at TIMESTAMP,
        is_read BOOLEAN DEFAULT false,
        is_saved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        fcm_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, fcm_token)
      )
    `)

    // Database migration: Add push_notifications_enabled column if it doesn't exist
    try {
      // Check if column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'push_notifications_enabled'
      `);

      if (columnCheck.rows.length === 0) {
        console.log('[MIGRATION] Adding push_notifications_enabled column to users table...');
        await pool.query(`
          ALTER TABLE users 
          ADD COLUMN push_notifications_enabled BOOLEAN DEFAULT true
        `);
        console.log('[MIGRATION] push_notifications_enabled column added successfully');
      } else {
        console.log('[MIGRATION] push_notifications_enabled column already exists');
      }

      // Ensure all users have the column value set
      const updateCount = await pool.query(`
        UPDATE users 
        SET push_notifications_enabled = true 
        WHERE push_notifications_enabled IS NULL
      `);
      
      if (updateCount.rowCount > 0) {
        console.log(`[MIGRATION] Updated ${updateCount.rowCount} users with push_notifications_enabled = true`);
      }
    } catch (migrationError) {
      console.error('[MIGRATION] Error during database migration:', migrationError);
    }

    // Database migration: the senders table gained list_id + discovery columns
    // after the original schema shipped. Older databases are missing them, which
    // makes findOrCreateSender (subscription import) and /api/newsletters throw
    // "column does not exist". ADD COLUMN IF NOT EXISTS is a no-op on fresh DBs.
    try {
      await pool.query(`ALTER TABLE senders ADD COLUMN IF NOT EXISTS list_id TEXT`);
      await pool.query(`ALTER TABLE senders ADD COLUMN IF NOT EXISTS description TEXT`);
      await pool.query(`ALTER TABLE senders ADD COLUMN IF NOT EXISTS category TEXT`);
      await pool.query(`ALTER TABLE senders ADD COLUMN IF NOT EXISTS subscriber_count INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE senders ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false`);
      // Required by the ON CONFLICT (email, list_id) in seedDiscoverableNewsletters.
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_senders_email_list_id ON senders(email, list_id)`);
      console.log('[MIGRATION] senders columns ensured (list_id, description, category, subscriber_count, featured)');
    } catch (sendersMigrationError) {
      console.error('[MIGRATION] Error ensuring senders columns:', sendersMigrationError);
    }

    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_senders_email ON senders(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_sender ON subscriptions(user_id, sender_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_sender_received ON messages(sender_id, received_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_gmail_id ON messages(gmail_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_devices_user_token ON devices(user_id, fcm_token)');

    console.log('PostgreSQL database tables initialized successfully')

    // Seed discoverable newsletters after tables are created
    try {
      await seedDiscoverableNewsletters();
      console.log('✅ Discoverable newsletters seeded successfully');
    } catch (error) {
      console.error('❌ Error seeding discoverable newsletters:', error);
    }

    // Sample data seeding removed - newsletters will be dynamically discovered from Gmail
  } catch (err) {
    console.error('Error initializing PostgreSQL database:', err)
  }
}

// Sample newsletter seeding removed - newsletters will be dynamically discovered from Gmail

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
initializeDatabase().catch(console.error)

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    
    console.log(`[AUTH] Incoming request to ${req.path}, token present: ${!!token}`);  // Add this log
    
    if (!token) {
      console.log('[AUTH] No token provided, returning 401');
      return res.status(401).json({ error: 'Access token required' })
    }
    
    console.log(`[AUTH] Token extracted (first 10 chars): ${token.substring(0, 10)}...`);  // Add masked token log
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[AUTH] JWT_SECRET environment variable is missing!');
      return res.status(500).json({ error: 'JWT_SECRET not configured' });
    }
    
    console.log('[AUTH] JWT_SECRET present, proceeding to verify');  // Add this log
    
    if (!jwt) {
      console.error('[AUTH] JWT library not available');
      return res.status(500).json({ error: 'JWT library not available' })
    }

    const decoded = jwt.verify(token, jwtSecret);  // Use jwtSecret
    
    console.log(`[AUTH] Token verified successfully, userId: ${decoded.userId}`);  // Add decoded log
    
    req.user = decoded
    next()
  } catch (error) {
    console.error(`[AUTH] Token verification failed for ${req.path}:`, {
      message: error.message,
      name: error.name,
      code: error.code,
      tokenLength: token ? token.length : 0
    });
    return res.status(401).json({ error: 'Invalid token', details: error.message })
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

// Add test sender for notification testing
app.post('/api/test/add-sender', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if test sender already exists
    const existingSender = await pool.query(
      'SELECT id FROM senders WHERE email = $1',
      ['siddharth.daswani7@gmail.com']
    );

    let senderId;
    if (existingSender.rows.length > 0) {
      senderId = existingSender.rows[0].id;
    } else {
      // Create test sender
      const senderResult = await pool.query(`
        INSERT INTO senders (name, email, description, category, subscriber_count, featured, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, ['Test User', 'siddharth.daswani7@gmail.com', 'Test sender for notification testing', 'Testing', 1, false]);

      senderId = senderResult.rows[0].id;
    }

    // Subscribe the user to this sender
    await pool.query(`
      INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
      VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, sender_id)
      DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
    `, [userId, senderId]);

    res.json({
      success: true,
      message: 'Test sender added and user subscribed',
      senderId: senderId
    });
  } catch (error) {
    console.error('Error adding test sender:', error);
    res.status(500).json({ error: 'Failed to add test sender' });
  }
})

// Debug endpoint to check notification setup
app.get('/api/debug/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`[DEBUG] Checking notification setup for user ${userId}`);

    // Check test sender
    const testSender = await pool.query(
      'SELECT id, name, email FROM senders WHERE email = $1',
      ['siddharth.daswani7@gmail.com']
    );

    console.log(`[DEBUG] Test sender found:`, testSender.rows.length > 0);

    let subscription = null;
    if (testSender.rows.length > 0) {
      // Check user's subscription to test sender
      subscription = await pool.query(`
        SELECT s.is_active, u.push_notifications_enabled
        FROM subscriptions s
        JOIN users u ON s.user_id = u.id
        WHERE s.sender_id = $1 AND s.user_id = $2
      `, [testSender.rows[0].id, userId]);

      console.log(`[DEBUG] Subscription found:`, subscription.rows.length > 0);
    }

    // Check user's devices
    const devices = await pool.query(
      'SELECT fcm_token FROM devices WHERE user_id = $1 AND fcm_token IS NOT NULL',
      [userId]
    );

    console.log(`[DEBUG] Devices found:`, devices.rows.length);

    // Check user's notification settings
    const userSettings = await pool.query(
      'SELECT push_notifications_enabled FROM users WHERE id = $1',
      [userId]
    );

    console.log(`[DEBUG] User settings found:`, userSettings.rows.length > 0);

    // Check database schema
    let schemaCheck = null;
    try {
      schemaCheck = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'push_notifications_enabled'
      `);

      console.log(`[DEBUG] Schema check for push_notifications_enabled:`, schemaCheck.rows);
    } catch (schemaError) {
      console.error(`[DEBUG] Schema check failed:`, schemaError.message);
    }

    const response = {
      testSender: testSender.rows[0] || null,
      subscription: subscription?.rows[0] || null,
      devices: devices.rows.map(d => d.fcm_token ? d.fcm_token.substring(0, 20) + '...' : null),
      userSettings: userSettings.rows[0] || null,
      firebaseConfigured: !!admin.messaging,
      databaseConnection: 'connected',
      schemaCheck: schemaCheck?.rows || null
    };

    console.log(`[DEBUG] Response:`, JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('Error in debug notifications:', error);
    res.status(500).json({
      error: 'Failed to debug notifications',
      details: error.message,
      databaseConnection: 'error'
    });
  }
})

// Test notification endpoint
app.post('/api/test/notification', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`[TEST_NOTIFICATION] Sending test push to user ${userId}`);

    // Get user's FCM token
    const devicesResult = await pool.query(
      'SELECT fcm_token FROM devices WHERE user_id = $1 AND fcm_token IS NOT NULL',
      [userId]
    );

    if (devicesResult.rows.length === 0) {
      console.log(`[TEST_NOTIFICATION] No FCM token found for user ${userId}`);
      return res.status(400).json({ error: 'No device token registered. Please restart the app to register.' });
    }

    const token = devicesResult.rows[0].fcm_token;
    console.log(`[TEST_NOTIFICATION] Found token: ${token.substring(0, 20)}...`);

    const expo = new Expo();

    if (token.startsWith('ExponentPushToken[')) {
      // Expo dev token
      console.log(`[TEST_NOTIFICATION] Using Expo SDK for dev token`);

      if (!Expo.isExpoPushToken(token)) {
        console.log(`[TEST_NOTIFICATION] Invalid Expo push token`);
        return res.status(400).json({ error: 'Invalid Expo push token' });
      }

      const messages = [{
        to: token,
        sound: 'default',
        title: 'Test Notification',
        body: 'This is a test push from The Postbox app.',
        data: {
          type: 'test',
          timestamp: Date.now().toString(),
        },
      }];

      const chunks = expo.chunkPushNotifications(messages);
      const tickets = [];

      for (let chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log(`[TEST_NOTIFICATION] Expo tickets:`, ticketChunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error(`[TEST_NOTIFICATION] Expo send error:`, error);
          return res.status(500).json({ error: 'Failed to send via Expo', details: error.message });
        }
      }

      const validTickets = tickets.filter(t => t.status !== 'error');
      console.log(`[TEST_NOTIFICATION] Expo send complete: ${validTickets.length} success`);

      res.json({ 
        success: true, 
        tickets,
        details: 'Test notification sent via Expo SDK.' 
      });

    } else {
      // Native FCM token
      console.log(`[TEST_NOTIFICATION] Using Firebase for native token`);

      if (!admin.messaging) {
        console.log(`[TEST_NOTIFICATION] Firebase Admin not initialized`);
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      const message = {
        notification: {
          title: 'Test Notification',
          body: 'This is a test push from The Postbox app.',
        },
        data: {
          type: 'test',
          timestamp: Date.now().toString(),
        },
        token: token,
      };

      const response = await admin.messaging().send(message);
      console.log(`[TEST_NOTIFICATION] Firebase send success:`, response);

      res.json({ 
        success: true, 
        messageId: response,
        details: 'Test notification sent via Firebase.' 
      });
    }

  } catch (error) {
    console.error('[TEST_NOTIFICATION] Error sending test push:', error);
    res.status(500).json({ 
      error: 'Failed to send test notification',
      details: error.message 
    });
  }
})

// --- OAUTH2 SETUP ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === 'production'
    ? process.env.PRODUCTION_REDIRECT_URI || 'https://the-postbox-backend.fly.dev/oauth2callback'
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

    // Use the app's real URL scheme (see mobile app.config.js: postbox / postbox-dev).
    // NOTE: this server-side web-OAuth callback is legacy — the mobile app signs in
    // via PKCE through POST /login, not this redirect. Kept correct for completeness.
    const redirectUrl = `postbox://auth?token=${jwtToken}`
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
    const userId = req.user.userId;
    const senders = await pool.query(`
      SELECT 
        s.*, 
        COUNT(m.id) as message_count,
        COALESCE(sub.is_active, false) as is_active
      FROM senders s
      LEFT JOIN messages m ON s.id = m.sender_id
      LEFT JOIN subscriptions sub ON s.id = sub.sender_id AND sub.user_id = $1
      GROUP BY s.id, sub.is_active
      ORDER BY s.name
    `, [userId])
    res.json(senders.rows)
  } catch (error) {
    console.error('Error fetching senders:', error)
    res.status(500).json({ error: 'Failed to fetch senders' })
  }
})

app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const offset = (page - 1) * limit

    // Only return messages from senders the user is subscribed to
    const messages = await pool.query(`
      SELECT m.*, s.name as sender_name, s.email as sender_email
      FROM messages m
      JOIN senders s ON m.sender_id = s.id
      JOIN subscriptions sub ON s.id = sub.sender_id
      WHERE sub.user_id = $1 AND sub.is_active = true
      ORDER BY m.received_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset])

    // Only log if there are issues or for debugging
    if (messages.rowCount === 0) {
      console.log('[API] No messages found for user');
    }

    // Return direct array as expected by mobile app
    res.json(messages.rows || [])
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

// Newsletter discovery endpoint
app.get('/discover', async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;
    
    let query = `
      SELECT s.*, COUNT(m.id) as message_count
      FROM senders s
      LEFT JOIN messages m ON s.id = m.sender_id
      WHERE s.description IS NOT NULL AND s.description != ''
    `;
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND s.category = $${paramCount}`;
      params.push(category);
    }

    if (search) {
      paramCount++;
      query += ` AND (s.name ILIKE $${paramCount} OR s.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY s.id ORDER BY s.featured DESC, s.subscriber_count DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const newsletters = await pool.query(query, params);
    
    // Convert boolean featured to number for mobile app compatibility
    const formattedNewsletters = newsletters.rows.map(newsletter => ({
      ...newsletter,
      featured: newsletter.featured ? 1 : 0
    }));

    res.json(formattedNewsletters);
  } catch (error) {
    console.error('Error fetching discoverable newsletters:', error);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
})

// Newsletter discovery subscription endpoint
app.post('/discover/subscribe', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { senderId } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: 'Sender ID is required' });
    }

    // Check if sender exists
    const senderResult = await pool.query('SELECT * FROM senders WHERE id = $1', [senderId]);
    if (senderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Newsletter not found' });
    }

    // Create or update subscription
    await pool.query(`
      INSERT INTO subscriptions (user_id, sender_id, is_active, created_at, updated_at)
      VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, sender_id) 
      DO UPDATE SET is_active = true, updated_at = CURRENT_TIMESTAMP
    `, [userId, senderId]);

    res.json({ success: true, message: 'Successfully subscribed to newsletter' });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Failed to subscribe to newsletter' });
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

    // Convert boolean fields to numbers for mobile app compatibility
    const formattedSubscriptions = subscriptions.rows.map(sub => ({
      ...sub,
      featured: sub.featured ? 1 : 0,
      is_subscribed: sub.is_active ? 1 : 0
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

// Notification settings endpoint (alias of /api/notification-settings).
// NOTE: this previously selected columns that don't exist on the users table
// (email_notifications, digest_frequency, quiet_hours_*) and 500'd at runtime —
// and the mobile app calls THIS route. Now mirrors the /api variant exactly so
// both return the same shape using the real `push_notifications_enabled` column.
app.get('/notification-settings', authenticateToken, async (req, res) => {
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
      notificationSound: true, // Default (not yet persisted server-side)
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

    // First, try to use refresh token if available
    const userResult = await pool.query(
      'SELECT google_refresh_token, temp_access_token, temp_token_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentTime = Math.floor(Date.now() / 1000);

    // Check if we have a valid access token
    if (user.temp_access_token && user.temp_token_expiry && user.temp_token_expiry > currentTime) {
      console.log('[GMAIL_REFRESH] Using existing valid access token');
      return res.json({
        success: true,
        message: 'Using existing access token',
        accessToken: user.temp_access_token,
        expiresIn: user.temp_token_expiry - currentTime
      });
    }

    // Try refresh token first
    if (user.google_refresh_token) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({
          refresh_token: user.google_refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();

        // Store the new access token temporarily
        const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000); // 1 hour from now
        await pool.query(
          'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
          [credentials.access_token, expiryTime, userId]
        );

        console.log('[GMAIL_REFRESH] Successfully refreshed using refresh token');
        return res.json({
          success: true,
          message: 'Gmail access refreshed successfully',
          accessToken: credentials.access_token
        });
      } catch (error) {
        console.log('[GMAIL_REFRESH] Refresh token failed, will prompt re-auth:', error.message);
      }
    }

    // If no refresh token or refresh failed, we need user to re-authenticate
    console.log('[GMAIL_REFRESH] No valid refresh token available');
    return res.status(401).json({
      error: 'Gmail access expired. Please re-authenticate.',
      needsReauth: true
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
        { expiresIn: '1h' }
      );
      
      res.json({ 
        accessToken: newAccessToken,
        expiresIn: 3600 // 1 hour in seconds
      });
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Mobile app OAuth endpoint - handle the full OAuth flow for refresh tokens
app.post('/auth/mobile-oauth', async (req, res) => {
  try {
    const { authCode, codeVerifier, clientId } = req.body;
    
    if (!authCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    logAuth('INFO', 'Starting mobile OAuth flow', { 
      authCodeSnippet: snippet(authCode),
      clientId: clientId || 'default',
      hasCodeVerifier: !!codeVerifier
    });

    // Use the iOS client ID and redirect URI for mobile PKCE flow
    const mobileClientId = clientId || '493373719535-v990sc2u46lgga6nkbt962isqr7518ni.apps.googleusercontent.com';
    const mobileRedirectUri = 'com.googleusercontent.apps.493373719535-v990sc2u46lgga6nkbt962isqr7518ni:/oauth2redirect';
    
    // Set up OAuth2 client with mobile configuration
    const oauth2Client = new google.auth.OAuth2(
      mobileClientId,
      null, // No client secret needed for mobile PKCE flow
      mobileRedirectUri
    );

    // Exchange authorization code for tokens
    const tokenResponse = await oauth2Client.getToken({
      code: authCode,
      code_verifier: codeVerifier, // For PKCE
    });

    const { tokens } = tokenResponse;
    logAuth('SUCCESS', 'OAuth tokens obtained', { 
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasIdToken: !!tokens.id_token
    });

    // Verify the ID token
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const userInfo = ticket.getPayload();
    if (!userInfo || !userInfo.sub) {
      return res.status(400).json({ error: 'Invalid ID token' });
    }

    logAuth('SUCCESS', 'ID token verified', { 
      googleId: userInfo.sub, 
      email: userInfo.email 
    });

    // Find or create user
    const user = await findOrCreateUser(userInfo.sub, userInfo.email);

    // Store the refresh token
    if (tokens.refresh_token) {
      await pool.query(
        'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
        [tokens.refresh_token, user.id]
      );
      logAuth('SUCCESS', 'Refresh token stored', { userId: user.id });
    }

    // Store the access token temporarily
    if (tokens.access_token) {
      const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000);
      await pool.query(
        'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
        [tokens.access_token, expiryTime, user.id]
      );
      logAuth('SUCCESS', 'Access token stored', { userId: user.id });
    }

    // Generate JWT for our app
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Generate refresh token for our app
    const appRefreshToken = jwt.sign(
      { userId: user.id, email: user.email },
      REFRESH_JWT_SECRET,
      { expiresIn: '30d' }
    );

    logAuth('SUCCESS', 'Mobile OAuth completed', { 
      userId: user.id, 
      hasRefreshToken: !!tokens.refresh_token 
    });

    res.json({
      token: jwtToken,
      refreshToken: appRefreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      hasGmailRefreshToken: !!tokens.refresh_token
    });

  } catch (error) {
    logAuth('ERROR', 'Mobile OAuth failed', { error: error.message });
    console.error('Mobile OAuth error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// Mobile app login endpoint - exchange Google ID token for app JWT
app.post('/login', async (req, res) => {
  try {
    const { idToken, accessToken, refreshToken: mobileRefreshToken, authCode } = req.body;

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
      hasMobileRefreshToken: !!mobileRefreshToken,
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

    // Priority 1: Use refresh token passed directly from mobile app (for PKCE flow)
    if (mobileRefreshToken) {
      logAuth('SUCCESS', 'Refresh token received directly from mobile app', {
        refreshTokenSnippet: snippet(mobileRefreshToken),
        userId: user.id
      });
      refreshToken = mobileRefreshToken;

      // Store the refresh token for future use
      await pool.query(
        'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
        [refreshToken, user.id]
      );
      logAuth('SUCCESS', 'Mobile refresh token saved to database', { userId: user.id });
    } else {
      // Handle mobile OAuth flow where refresh token is not available
      logAuth('INFO', 'No refresh token from mobile app - this is expected for Expo Auth Session', {
        userId: user.id,
        note: 'Mobile apps typically don\'t get refresh tokens in initial OAuth response'
      });

      // For mobile apps, we'll use the access token temporarily and implement a different strategy
      logAuth('INFO', 'Mobile OAuth strategy: Using access token for immediate Gmail access', {
        userId: user.id,
        strategy: 'Store access token temporarily, prompt re-auth when needed'
      });
      // Priority 2: Check if user already has a refresh token from a previous successful exchange
      logAuth('INFO', 'Checking for existing refresh token', { userId: user.id });
      const existingUser = await pool.query(
        'SELECT google_refresh_token FROM users WHERE id = $1',
        [user.id]
      );

      if (existingUser.rows.length > 0 && existingUser.rows[0].google_refresh_token) {
        logAuth('INFO', 'User already has a refresh token from previous login', { userId: user.id, hasRefreshToken: true });
        refreshToken = existingUser.rows[0].google_refresh_token;
      } else {
        // For mobile OAuth, we don't have authCode to exchange since Expo handled it
        logAuth('INFO', 'Mobile OAuth: No auth code available for exchange', {
          userId: user.id,
          reason: 'Expo Auth Session handles token exchange internally'
        });

        // Since we can't get a refresh token through the mobile flow,
        // we'll implement a different strategy for Gmail access
        logAuth('INFO', 'Implementing mobile Gmail access strategy', {
          userId: user.id,
          strategy: 'Use access token + implement refresh mechanism'
        });
      }
    }

    // Log final refresh token status
    logAuth('INFO', 'Login process completed', {
      userId: user.id,
      hasRefreshToken: !!refreshToken,
      refreshTokenSource: mobileRefreshToken ? 'mobile_direct' : (refreshToken ? 'existing_or_exchanged' : 'none'),
      mobileStrategy: !mobileRefreshToken ? 'access_token_only' : 'full_oauth'
    });

    // If this is the first time, trigger the initial sender scan using available tokens
    if (!user.initial_scan_complete) {
      let authClient = null;

      if (refreshToken) {
        // Use refresh token if available
        logAuth('INFO', 'Initial scan not completed, starting scan with refresh token', { userId: user.id });
        authClient = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        authClient.setCredentials({ refresh_token: refreshToken });
      } else if (accessToken) {
        // Use access token if refresh token is not available (mobile OAuth case)
        logAuth('INFO', 'Initial scan not completed, starting scan with access token (mobile OAuth)', { userId: user.id });
        authClient = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        authClient.setCredentials({ access_token: accessToken });
      }

      if (authClient) {
        // Test the token and trigger initial scan
        try {
          // For access tokens, we don't need to getAccessToken() - we already have it
          if (refreshToken) {
            await authClient.getAccessToken();
          }
          logAuth('SUCCESS', 'Token validated, triggering initial scan', { userId: user.id });

          // Add detailed logging before calling initialSenderScan
          console.log(`[INITIAL_SCAN_TRIGGER] About to call initialSenderScan for user ${user.id}`);
          console.log(`[INITIAL_SCAN_TRIGGER] Auth client has credentials:`, !!authClient.credentials);
          console.log(`[INITIAL_SCAN_TRIGGER] Access token present:`, !!authClient.credentials?.access_token);

          initialSenderScan(user.id, authClient).then(() => {
            console.log(`[INITIAL_SCAN_SUCCESS] Initial scan completed successfully for user ${user.id}`);
          }).catch(err => {
            console.error(`[INITIAL_SCAN_ERROR] Error during initial sender scan for user ${user.id}:`, err.message);
            console.error(`[INITIAL_SCAN_ERROR] Full error:`, err);
            logAuth('ERROR', 'Error during initial sender scan', { error: err.message, userId: user.id });
          });
        } catch (error) {
          logAuth('ERROR', 'Failed to authenticate with token for initial scan', {
            error: error.message,
            userId: user.id
          });
        }
      } else {
        logAuth('WARN', 'No tokens available for initial scan', {
          userId: user.id,
          hasRefreshToken: !!refreshToken,
          hasAccessToken: !!accessToken
        });
      }
    }

    // Create our app-specific JWTs
    const appToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    const refreshTokenJwt = jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_JWT_SECRET, { expiresIn: '90d' });
    logAuth('SUCCESS', 'Login completed successfully', {
      userId: user.id,
      hasRefreshToken: !!refreshToken,
      tokenSnippet: snippet(appToken)
    });

    // The mobile app expects the key to be "token"; include refresh token for silent renewals
    res.json({ token: appToken, refreshToken: refreshTokenJwt, expiresIn: 3600 });
  } catch (error) {
    logAuth('ERROR', 'Error during login', {
      error: error.message,
      errorStack: error.stack
    });
    res.status(500).json({ error: 'Login failed.' });
  }
});

// --- ERROR HANDLING ---
// Sentry v8+: setupExpressErrorHandler replaces Handlers.requestHandler/errorHandler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app)
}

app.use((error, req, res, next) => {
  logger.error({ err: { message: error.message, stack: error.stack } }, 'Unhandled Express error')
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

    // Check if this sender already exists (email and list_id combination)
    const query = `SELECT * FROM senders WHERE email = $1 AND COALESCE(list_id, '') = COALESCE($2, '')`;
    const result = await pool.query(query, [email, listId]);
    
    if (result.rows.length > 0) {
      return result.rows[0]; // It exists, return it
    }

    // Create new sender (email + list_id combination is unique)
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

// Send push notification for new message
async function sendNotificationForNewMessage(senderId, subject) {
  try {
    console.log(`[NOTIFICATION] Sending push notification for new message from sender ${senderId}`);

    const senderResult = await pool.query(
      'SELECT name, email FROM senders WHERE id = $1',
      [senderId]
    );

    if (senderResult.rows.length === 0) {
      console.log(`[NOTIFICATION] Sender ${senderId} not found, skipping notification`);
      return;
    }

    const sender = senderResult.rows[0];
    console.log(`[NOTIFICATION] Sending notification for message from: ${sender.name} (${sender.email})`);

    // Debug: Check all subscriptions for this sender
    const allSubscriptionsResult = await pool.query(`
      SELECT u.id, u.email, u.push_notifications_enabled, s.is_active
      FROM users u
      JOIN subscriptions s ON u.id = s.user_id
      WHERE s.sender_id = $1
    `, [senderId]);

    console.log(`[NOTIFICATION] All subscriptions for sender ${senderId}:`, allSubscriptionsResult.rows.map(r => ({
      userId: r.id,
      email: r.email,
      notificationsEnabled: r.push_notifications_enabled,
      isActive: r.is_active
    })));

    const usersResult = await pool.query(`
      SELECT DISTINCT u.id, u.push_notifications_enabled
      FROM users u
      JOIN subscriptions s ON u.id = s.user_id
      WHERE s.sender_id = $1 AND s.is_active = true
    `, [senderId]);

    if (usersResult.rows.length === 0) {
      console.log(`[NOTIFICATION] No users subscribed to sender ${senderId} with notifications enabled`);
      return;
    }

    console.log(`[NOTIFICATION] Found ${usersResult.rows.length} users to notify`);

    const userIds = usersResult.rows.map(row => row.id);
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');

    const devicesResult = await pool.query(`
      SELECT DISTINCT fcm_token
      FROM devices
      WHERE user_id IN (${placeholders}) AND fcm_token IS NOT NULL
    `, userIds);

    console.log(`[NOTIFICATION] Device query result:`, {
      userIds,
      deviceCount: devicesResult.rows.length,
      tokens: devicesResult.rows.map(row => row.fcm_token ? row.fcm_token.substring(0, 20) + '...' : 'null')
    });

    if (devicesResult.rows.length === 0) {
      console.log(`[NOTIFICATION] No registered devices found for users: ${userIds.join(', ')}`);
      return;
    }

    const tokens = devicesResult.rows.map(row => row.fcm_token);
    console.log(`[NOTIFICATION] Processing ${tokens.length} tokens`);

    const expo = new Expo();
    let firebaseSuccess = 0;
    let expoSuccess = 0;
    let errors = [];

    for (const token of tokens) {
      try {
        if (token.startsWith('ExponentPushToken[')) {
          // Expo dev token
          console.log(`[NOTIFICATION] Using Expo SDK for token: ${token.substring(0, 20)}...`);

          if (!Expo.isExpoPushToken(token)) {
            errors.push({ token: token.substring(0, 20) + '...', error: 'Invalid Expo push token' });
            continue;
          }

          const messages = [{
            to: token,
            sound: 'default',
            title: 'New Newsletter',
            body: `New message from ${sender.name}: ${subject.length > 100 ? subject.substring(0, 100) + '...' : subject}`,
            data: {
              senderId: senderId.toString(),
              senderName: sender.name,
              subject: subject,
              type: 'new_message',
            },
          }];

          const chunks = expo.chunkPushNotifications(messages);
          const tickets = [];

          for (let chunk of chunks) {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
          }

          const validTickets = tickets.filter(t => t.status !== 'error');
          expoSuccess += validTickets.length;
          if (tickets.some(t => t.status === 'error')) {
            errors.push({ token: token.substring(0, 20) + '...', error: 'Expo send failed' });
          }

        } else {
          // Native FCM token
          console.log(`[NOTIFICATION] Using Firebase for token: ${token.substring(0, 20)}...`);

          if (admin.messaging) {
            const message = {
              notification: {
                title: 'New Newsletter',
                body: `New message from ${sender.name}: ${subject.length > 100 ? subject.substring(0, 100) + '...' : subject}`,
              },
              data: {
                senderId: senderId.toString(),
                senderName: sender.name,
                subject: subject,
                type: 'new_message',
              },
              token: token,
            };

            const response = await admin.messaging().send(message);
            if (response) {
              firebaseSuccess++;
            } else {
              errors.push({ token: token.substring(0, 20) + '...', error: 'Firebase send failed' });
            }
          } else {
            errors.push({ token: token.substring(0, 20) + '...', error: 'Firebase not available' });
          }
        }
      } catch (error) {
        console.error(`[NOTIFICATION] Error sending to token ${token.substring(0, 20)}... :`, error);
        errors.push({ token: token.substring(0, 20) + '...', error: error.message });
      }
    }

    console.log(`[NOTIFICATION] Notification send complete: Expo=${expoSuccess}, Firebase=${firebaseSuccess}, Errors=${errors.length}`);
    if (errors.length > 0) {
      console.log(`[NOTIFICATION] Errors:`, errors);
    }

  } catch (error) {
    console.error('Error sending notification:', error);
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

    // If a new message was inserted, send push notifications
    if (result.rows.length > 0) {
      try {
        await sendNotificationForNewMessage(senderId, subject);
      } catch (notificationError) {
        console.error('Failed to send notification for new message:', notificationError);
        // Don't throw - we don't want to fail message saving due to notification issues
      }
    }

    // Return true if a new row was inserted, false if it already existed
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error in saveMessage:', error);
    throw error;
  }
}


// --- INITIAL SENDER SCAN FUNCTION ---
async function initialSenderScan(userId, authClient) {
  try {
    console.log(`[INITIAL_SCAN_START] Starting initial scan for user ${userId}`);
    console.log(`[INITIAL_SCAN_START] Auth client has credentials:`, !!authClient.credentials);
    console.log('[INITIAL_SCAN] Fetching recent messages for initial scan...');
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // A set to collect unique sender email addresses
    const uniqueSenders = new Set();

    // First, list messages to get their IDs
    console.log('[INITIAL_SCAN] Making Gmail API call to list messages...');
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 300, // Scan a larger number of recent emails
    });

    console.log(`[INITIAL_SCAN] Gmail API response received:`, {
      success: !!listResponse.data,
      messageCount: listResponse.data?.messages?.length || 0
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

    // Get user's tokens (refresh token or access token)
    const userResult = await pool.query(
      'SELECT google_refresh_token, temp_access_token, temp_token_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentTime = Math.floor(Date.now() / 1000);

    let accessToken = null;

    // Priority 1: Use valid access token if available
    if (user.temp_access_token && user.temp_token_expiry && user.temp_token_expiry > currentTime) {
      console.log('[BACKFILL] Using existing valid access token');
      accessToken = user.temp_access_token;
    }
    // Priority 2: Try to get new access token using refresh token
    else if (user.google_refresh_token) {
      try {
        console.log('[BACKFILL] Getting new access token using refresh token');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({
          refresh_token: user.google_refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;

        // Store the new access token temporarily
        const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000); // 1 hour from now
        await pool.query(
          'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
          [accessToken, expiryTime, userId]
        );
        console.log('[BACKFILL] Access token refreshed and stored');
      } catch (error) {
        console.log('[BACKFILL] Failed to refresh access token:', error.message);
      }
    }

    if (!accessToken) {
      return res.status(401).json({
        error: 'No valid Gmail access token available. Please re-authenticate.',
        needsReauth: true
      });
    }

    // Set up Gmail API client with access token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken
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

// Clear all messages endpoint
app.post('/messages/clear', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Delete all messages for the user's subscribed senders
    await pool.query(`
      DELETE FROM messages 
      WHERE sender_id IN (
        SELECT sender_id FROM subscriptions 
        WHERE user_id = $1 AND is_active = true
      )
    `, [userId]);

    res.json({ success: true, message: 'All messages cleared successfully' });
  } catch (error) {
    console.error('Error clearing messages:', error);
    res.status(500).json({ error: 'Failed to clear messages' });
  }
});

// Manual rescan endpoint
app.get('/rescan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Trigger a manual rescan of Gmail messages
    const result = await pool.query(`
      UPDATE users 
      SET initial_scan_complete = false, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true, 
      message: 'Rescan triggered successfully. Messages will be updated shortly.' 
    });
  } catch (error) {
    console.error('Error triggering rescan:', error);
    res.status(500).json({ error: 'Failed to trigger rescan' });
  }
});

// --- MANUAL TRIGGER INITIAL SCAN ENDPOINT ---
app.post('/api/trigger-initial-scan-manual', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`[MANUAL_SCAN] Manually triggering initial scan for user: ${userId}`);

    // Get user's tokens
    const userResult = await pool.query(
      'SELECT google_refresh_token, temp_access_token, temp_token_expiry, initial_scan_complete FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    console.log(`[MANUAL_SCAN] User status:`, {
      hasRefreshToken: !!user.google_refresh_token,
      hasAccessToken: !!user.temp_access_token,
      initialScanComplete: user.initial_scan_complete
    });

    // Reset initial scan status for testing
    await pool.query('UPDATE users SET initial_scan_complete = false WHERE id = $1', [userId]);
    console.log(`[MANUAL_SCAN] Reset initial_scan_complete to false for testing`);

    // Now trigger the scan logic
    const currentTime = Math.floor(Date.now() / 1000);
    let authClient = null;

    if (user.google_refresh_token) {
      console.log(`[MANUAL_SCAN] Using refresh token`);
      authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      authClient.setCredentials({ refresh_token: user.google_refresh_token });
    } else if (user.temp_access_token && user.temp_token_expiry && user.temp_token_expiry > currentTime) {
      console.log(`[MANUAL_SCAN] Using access token`);
      authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      authClient.setCredentials({ access_token: user.temp_access_token });
    }

    if (!authClient) {
      return res.status(400).json({ error: 'No valid tokens available' });
    }

    // Run the initial scan
    await initialSenderScan(userId, authClient);

    res.json({
      success: true,
      message: 'Manual initial scan completed successfully'
    });

  } catch (error) {
    console.error('[MANUAL_SCAN] Error during manual scan:', error);
    res.status(500).json({ error: 'Manual scan failed: ' + error.message });
  }
});

// --- TRIGGER INITIAL SCAN ENDPOINT ---
app.post('/api/trigger-initial-scan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('[TRIGGER_SCAN] Manually triggering initial scan for user:', userId);

    // Get user's tokens
    const userResult = await pool.query(
      'SELECT google_refresh_token, temp_access_token, temp_token_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentTime = Math.floor(Date.now() / 1000);

    let accessToken = null;

    // Try to get a valid access token
    if (user.temp_access_token && user.temp_token_expiry && user.temp_token_expiry > currentTime) {
      accessToken = user.temp_access_token;
    } else if (user.google_refresh_token) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({
          refresh_token: user.google_refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;

        // Store the new access token
        const expiryTime = Math.floor((Date.now() + (3600 * 1000)) / 1000);
        await pool.query(
          'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
          [accessToken, expiryTime, userId]
        );
      } catch (error) {
        console.log('[TRIGGER_SCAN] Failed to refresh access token:', error.message);
      }
    }

    if (!accessToken) {
      return res.status(401).json({
        error: 'No valid Gmail access token available. Please re-authenticate.',
        needsReauth: true
      });
    }

    // Set up Gmail API client with access token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken
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
      'SELECT id, email, google_id, initial_scan_complete, google_refresh_token, temp_access_token, temp_token_expiry FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentTime = Math.floor(Date.now() / 1000);
    const tokenValid = user.temp_access_token && user.temp_token_expiry && user.temp_token_expiry > currentTime;

    res.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      googleId: user.google_id,
      initialScanComplete: user.initial_scan_complete,
      hasRefreshToken: !!user.google_refresh_token,
      hasAccessToken: !!user.temp_access_token,
      accessTokenValid: tokenValid,
      accessTokenExpiry: user.temp_token_expiry,
      timeUntilExpiry: user.temp_token_expiry ? user.temp_token_expiry - currentTime : null,
      needsReauth: !tokenValid && !user.google_refresh_token
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

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
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

// Re-authentication endpoint
app.post('/reauth', async (req, res) => {
  try {
    const { idToken, accessToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Missing Google ID token.' });
    }

    // Verify the Google ID token
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

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Invalid Google token: missing googleId or email.' });
    }

    // Find user
    const userResult = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Store the access token temporarily for immediate Gmail API access
    if (accessToken) {
      await pool.query(
        'UPDATE users SET temp_access_token = $1, temp_token_expiry = $2 WHERE id = $3',
        [accessToken, Date.now() + (3600 * 1000), user.id] // 1 hour expiry
      );
    }

    // Generate new JWT tokens
    const appToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    const refreshTokenJwt = jwt.sign({ userId: user.id, type: 'refresh' }, REFRESH_JWT_SECRET, { expiresIn: '90d' });

    res.json({ 
      token: appToken, 
      refreshToken: refreshTokenJwt, 
      expiresIn: 3600,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Error in re-authentication:', error);
    res.status(500).json({ error: 'Re-authentication failed' });
  }
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000
app.listen(PORT, async () => {
  logger.info({ port: PORT, sentry: !!process.env.SENTRY_DSN }, `Backend listening on port ${PORT}`)
  // Database initialization (including seeding) is handled in initializeDatabase()
})

// Export for testing
module.exports = { app, pool }


