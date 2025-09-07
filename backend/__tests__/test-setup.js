// Test database setup for PostgreSQL
const { Pool } = require('pg');
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'newsletter_reader_test';

// Override DATABASE_URL to use test database
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'devpassword';
process.env.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${process.env.DB_NAME}`;

// Create main pool for database management
const mainPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'postgres', // Connect to default postgres database
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'devpassword',
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// Create test database pool
const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'devpassword',
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// Synchronous database setup function
async function setupTestDatabaseSync() {
  try {
    console.log('🔄 Setting up test database synchronously...');

    // Force close any existing connections to the test database
    try {
      await mainPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${process.env.DB_NAME}'
        AND pid <> pg_backend_pid()
      `);
    } catch (error) {
      // Ignore errors if database doesn't exist yet
    }

    // Drop and recreate test database to ensure clean state
    try {
      await mainPool.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
    } catch (error) {
      // Database might not exist, that's ok
    }

    // Create fresh test database
    await mainPool.query(`CREATE DATABASE ${process.env.DB_NAME}`);

    // Create tables in test database
    await testPool.query(`
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
    `);

    await testPool.query(`
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
    `);

    await testPool.query(`
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
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        sender_id INTEGER REFERENCES senders(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sender_id)
      )
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        fcm_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Test database setup complete (synchronous)');
  } catch (error) {
    console.error('❌ Error setting up test database synchronously:', error);
    throw error;
  }
}

// Export the sync setup function
module.exports.setupTestDatabaseSync = setupTestDatabaseSync;

beforeAll(async () => {
  try {
    // Database is already set up synchronously before app import
    // This beforeAll can be used for any additional test setup if needed
    console.log('✅ Test environment ready');
  } catch (error) {
    console.error('❌ Error in test beforeAll:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    // Close test pool first
    await testPool.end();

    // Force close any remaining connections to test database
    try {
      await mainPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${process.env.DB_NAME}'
        AND pid <> pg_backend_pid()
      `);
    } catch (error) {
      console.log('ℹ️ Could not terminate remaining connections:', error.message);
    }

    // Drop test database
    try {
      await mainPool.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
      console.log('✅ Test database dropped successfully');
    } catch (dropError) {
      console.log('ℹ️ Test database cleanup note:', dropError.message);
    }

    // Close main pool
    await mainPool.end();

    console.log('✅ All database connections closed and cleanup complete');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    // Force close pools even if there are errors
    try {
      await testPool.end();
    } catch (e) {
      console.log('⚠️ Could not close test pool:', e.message);
    }
    try {
      await mainPool.end();
    } catch (e) {
      console.log('⚠️ Could not close main pool:', e.message);
    }
  }
});

async function setupTestDatabase() {
  try {
    // Create users table
    await testPool.query(`
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
    `);

    // Create senders table
    await testPool.query(`
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
    `);

    // Create messages table
    await testPool.query(`
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
    `);

    // Create subscriptions table
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        sender_id INTEGER REFERENCES senders(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sender_id)
      )
    `);

    // Create devices table
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        fcm_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Test database tables created');
  } catch (error) {
    console.error('❌ Error setting up test database tables:', error);
    throw error;
  }
}

module.exports = {
  testPool,
  setupTestDatabaseSync
};
