-- ================================================
-- COMPLETE DATABASE MIGRATION
-- Adds all missing features
-- ================================================

-- Add onboarding tracking
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}';

-- Add daily_reset_time for fresh starts
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS daily_reset_time TIME DEFAULT '00:00:00';

-- Enhance tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Daily archives table
CREATE TABLE IF NOT EXISTS daily_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_date DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  habits_completed INTEGER DEFAULT 0,
  summary TEXT,
  praise TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, archive_date)
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced habits tracking
ALTER TABLE habits ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS last_completed DATE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- Habit frequency types: daily, weekly, monthly, custom
ALTER TABLE habits ALTER COLUMN frequency TYPE VARCHAR(50);

-- Add custom frequency data
ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency_data JSONB DEFAULT '{}';
-- Example: {"days": [1,3,5]} for Mon/Wed/Fri
-- Example: {"interval": 3, "unit": "days"} for every 3 days

-- Daily insights enhancement
ALTER TABLE insights ADD COLUMN IF NOT EXISTS insight_date DATE;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS insight_type VARCHAR(50);
ALTER TABLE insights ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completed_date ON tasks(user_id, completed_date) WHERE completed_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_archives_user_date ON daily_archives(user_id, archive_date);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);

-- ================================================
-- VERIFICATION
-- ================================================

DO $$ 
BEGIN
  RAISE NOTICE 'Migration complete! New tables and columns added.';
  RAISE NOTICE 'Tables: daily_archives, chat_messages';
  RAISE NOTICE 'Enhanced: tasks, habits, user_profiles, insights';
END $$;
