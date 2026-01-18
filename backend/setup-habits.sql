-- ================================================
-- HABITS DATABASE FIX - UUID VERSION
-- For databases using UUID primary keys
-- ================================================

-- Check current structure
\echo '--- Checking habits table structure ---'
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'habits' AND column_name = 'id';

-- Drop old habit_logs if exists
DROP TABLE IF EXISTS habit_logs CASCADE;

-- Create habit_logs with UUID support
CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(habit_id, date)
);

-- Add streak tracking columns to habits
ALTER TABLE habits ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS last_completed DATE;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS total_completions INTEGER DEFAULT 0;

-- Create performance indexes
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, date DESC);
CREATE INDEX idx_habit_logs_date ON habit_logs(date DESC);
CREATE INDEX idx_habits_streak ON habits(streak DESC);
CREATE INDEX idx_habits_user_archived ON habits(user_id, archived_at);

-- Show final structure
\echo ''
\echo '--- habit_logs table structure ---'
\d habit_logs

\echo ''
\echo '--- habits streak columns ---'
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'habits' 
  AND column_name IN ('streak', 'best_streak', 'last_completed', 'total_completions')
ORDER BY column_name;

-- Summary
\echo ''
\echo '=========================================='
\echo '✓ Database setup complete!'
\echo '✓ habit_logs table created (UUID support)'
\echo '✓ Streak columns added to habits'
\echo '✓ Indexes created'
\echo '=========================================='
\echo ''

-- Show stats
SELECT 
  (SELECT COUNT(*) FROM habits WHERE archived_at IS NULL) as active_habits,
  (SELECT COUNT(*) FROM habit_logs) as total_check_ins;

\echo ''
\echo '🎯 Next steps:'
\echo '1. Restart backend server'
\echo '2. Replace HabitTracker.js and HabitTracker.css'
\echo '3. Hard refresh browser (Ctrl+Shift+R)'
\echo '4. Test "Check In Today" button'
\echo ''