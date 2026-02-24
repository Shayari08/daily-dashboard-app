-- ================================================
-- MERGE HABITS + RECURRING GOALS
-- Unifies both systems into recurring_goals table
-- ================================================

-- Step 1: Add streak tracking columns to recurring_goals
ALTER TABLE recurring_goals ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
ALTER TABLE recurring_goals ADD COLUMN IF NOT EXISTS best_streak INTEGER DEFAULT 0;

-- Step 2: Create goal_completion_logs table (replaces habit_logs)
CREATE TABLE IF NOT EXISTS goal_completion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES recurring_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(goal_id, date)
);

CREATE INDEX IF NOT EXISTS idx_goal_completion_logs_goal ON goal_completion_logs(goal_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_goal_completion_logs_user ON goal_completion_logs(user_id, date DESC);

-- Step 3: Migrate existing habits into recurring_goals
INSERT INTO recurring_goals (user_id, title, frequency, times_per_week, streak, best_streak, last_completed_date, is_active, created_at)
SELECT
  h.user_id,
  h.name,
  CASE
    WHEN h.frequency = 'daily' THEN 'daily'
    ELSE 'x_per_week'
  END,
  CASE
    WHEN h.frequency = 'daily' THEN 7
    WHEN h.frequency = 'weekly' THEN 1
    WHEN h.frequency = 'monthly' THEN 1
    ELSE 7
  END,
  COALESCE(h.streak, 0),
  COALESCE(h.best_streak, 0),
  h.last_completed,
  (h.archived_at IS NULL),
  h.created_at
FROM habits h
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_goals rg
  WHERE rg.user_id = h.user_id AND rg.title = h.name
)
ON CONFLICT DO NOTHING;

-- Step 4: Migrate habit_logs into goal_completion_logs
-- Match by user_id + title (habit.name = recurring_goal.title)
INSERT INTO goal_completion_logs (goal_id, user_id, date, completed, notes, created_at)
SELECT
  rg.id,
  rg.user_id,
  hl.date,
  COALESCE(hl.completed, true),
  hl.notes,
  hl.created_at
FROM habit_logs hl
JOIN habits h ON hl.habit_id = h.id
JOIN recurring_goals rg ON rg.title = h.name AND rg.user_id = h.user_id
WHERE hl.date IS NOT NULL
ON CONFLICT (goal_id, date) DO NOTHING;

-- Verification
DO $$
DECLARE
  goal_count INTEGER;
  log_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO goal_count FROM recurring_goals;
  SELECT COUNT(*) INTO log_count FROM goal_completion_logs;
  RAISE NOTICE 'Migration complete: % recurring goals, % completion logs', goal_count, log_count;
END $$;
