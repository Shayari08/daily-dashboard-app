-- ================================================
-- RECURRING GOALS MIGRATION
-- Adds recurring goals table and needed columns
-- ================================================

-- Add missing columns to tasks table (needed for recurring goals + AI generation)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_goal_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtask_count INTEGER DEFAULT 0;

-- Add onboarding_data to users if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSONB;

-- Recurring Goals Table
CREATE TABLE IF NOT EXISTS recurring_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Goal details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'General',

  -- Frequency settings
  frequency VARCHAR(50) NOT NULL,  -- 'daily', 'weekly', 'specific_days', 'x_per_week'
  times_per_week INTEGER DEFAULT 1,
  specific_days TEXT[],

  -- Weekly tracking
  times_completed_this_week INTEGER DEFAULT 0,
  week_start_date DATE DEFAULT CURRENT_DATE,

  -- Task generation tracking
  last_generated_date DATE,
  tasks_generated_today BOOLEAN DEFAULT FALSE,

  -- Preferences
  preferred_time VARCHAR(50),
  duration_minutes INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add last_completed_date (prevents multiple completions per day)
ALTER TABLE recurring_goals ADD COLUMN IF NOT EXISTS last_completed_date DATE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_goals_user_id ON recurring_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_goals_active ON recurring_goals(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_recurring_goal ON tasks(recurring_goal_id);

-- Function to reset weekly counters
CREATE OR REPLACE FUNCTION reset_weekly_goal_counters()
RETURNS void AS $$
BEGIN
  UPDATE recurring_goals
  SET times_completed_this_week = 0,
      week_start_date = CURRENT_DATE,
      tasks_generated_today = FALSE
  WHERE week_start_date < DATE_TRUNC('week', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Recurring goals migration complete!';
  RAISE NOTICE 'Added columns: tasks.category, tasks.priority, tasks.recurring_goal_id, tasks.subtask_count';
  RAISE NOTICE 'Created table: recurring_goals';
END $$;
