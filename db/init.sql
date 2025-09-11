-- PostgreSQL initialization script for Newsletter Reader
-- This script creates the database schema for local development

-- Users Table: Stores user information
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    google_refresh_token TEXT,
    temp_access_token TEXT,
    temp_token_expiry BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_known_history_id TEXT,
    initial_scan_complete BOOLEAN DEFAULT FALSE NOT NULL
);

-- Senders Table: Stores information about unique newsletter senders
CREATE TABLE IF NOT EXISTS senders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    list_id TEXT,
    description TEXT,
    category TEXT DEFAULT 'Other',
    subscriber_count INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, list_id)
);

-- Messages Table: Stores individual email messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    gmail_id TEXT UNIQUE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    received_at TIMESTAMP NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES senders (id)
);

-- Subscriptions Table: Links users to senders they are subscribed to
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (sender_id) REFERENCES senders (id),
    UNIQUE(user_id, sender_id)
);

-- Devices Table: Stores FCM tokens for push notifications
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);
CREATE INDEX IF NOT EXISTS idx_messages_gmail_id ON messages(gmail_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_sender_id ON subscriptions(sender_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Insert some sample data for development
INSERT INTO senders (name, email, description, category, subscriber_count, featured) VALUES
('TechCrunch', 'noreply@techcrunch.com', 'Latest technology news and startup coverage', 'Technology', 1500000, TRUE),
('The Hustle', 'hello@thehustle.co', 'Business news and startup insights', 'Business', 800000, TRUE),
('Morning Brew', 'hello@morningbrew.com', 'Daily business newsletter', 'Business', 2000000, TRUE),
('Product Hunt', 'hello@producthunt.com', 'Discover the latest products and startups', 'Technology', 500000, FALSE)
ON CONFLICT (email, list_id) DO NOTHING;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_senders_updated_at BEFORE UPDATE ON senders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
