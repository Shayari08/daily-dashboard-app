const { Pool } = require('pg');
require('dotenv').config();

// When run directly, create a standalone pool; when imported, caller passes one in
const standalonePool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const initDatabase = async (pool = standalonePool) => {
  const client = await pool.connect();

  try {
    console.log('Starting database initialization...');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oauth_provider VARCHAR(50) NOT NULL,
        oauth_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        avatar_url TEXT,
        onboarding_completed BOOLEAN DEFAULT false,
        onboarding_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(oauth_provider, oauth_id)
      );
    `);
    console.log('✓ Users table created');

    // User profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        short_term_goals TEXT[],
        long_term_goals TEXT[],
        work_hours_start TIME,
        work_hours_end TIME,
        preferred_task_length INTEGER,
        energy_pattern VARCHAR(50),
        strictness_level VARCHAR(50) DEFAULT 'gentle',
        notification_preferences JSONB DEFAULT '{"email": false, "push": false}',
        track_energy BOOLEAN DEFAULT false,
        track_pain BOOLEAN DEFAULT false,
        track_cycle BOOLEAN DEFAULT false,
        onboarding_completed BOOLEAN DEFAULT false,
        onboarding_step INTEGER DEFAULT 0,
        onboarding_data JSONB DEFAULT '{}',
        daily_reset_time TIME DEFAULT '00:00:00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ User profiles table created');

    // User goals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(50) NOT NULL,
        goal_text TEXT NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        target_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, category, goal_text)
      );
    `);
    console.log('✓ User goals table created');

    // User preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        preference_key VARCHAR(100) NOT NULL,
        preference_value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, preference_key)
      );
    `);
    console.log('✓ User preferences table created');

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        category VARCHAR(100),
        priority VARCHAR(50) DEFAULT 'medium',
        deadline TIMESTAMP,
        energy_required INTEGER CHECK (energy_required >= 1 AND energy_required <= 5),
        priority_score FLOAT DEFAULT 0,
        user_order INTEGER,
        estimated_duration INTEGER,
        created_by VARCHAR(50) DEFAULT 'user',
        ai_reasoning TEXT,
        recurring_goal_id UUID,
        subtask_count INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        completed_date DATE,
        deleted_at TIMESTAMP,
        archived_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Tasks table created');

    // Habits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        frequency VARCHAR(50) DEFAULT 'daily',
        frequency_data JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'suggested',
        detection_evidence TEXT,
        ai_reasoning TEXT,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        last_completed DATE,
        accepted_at TIMESTAMP,
        archived_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Habits table created');

    // Habit logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed BOOLEAN DEFAULT true,
        log_date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Habit logs table created');

    // Recurring goals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'General',
        frequency VARCHAR(50) NOT NULL,
        times_per_week INTEGER DEFAULT 1,
        specific_days TEXT[],
        times_completed_this_week INTEGER DEFAULT 0,
        week_start_date DATE DEFAULT CURRENT_DATE,
        last_generated_date DATE,
        tasks_generated_today BOOLEAN DEFAULT FALSE,
        last_completed_date DATE,
        preferred_time VARCHAR(50),
        duration_minutes INTEGER,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Recurring goals table created');

    // Daily archives table
    await client.query(`
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
    `);
    console.log('✓ Daily archives table created');

    // Chat messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        context JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Chat messages table created');

    // Behavioral logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS behavioral_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL,
        context JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Behavioral logs table created');

    // Daily states table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        state_date DATE NOT NULL,
        energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 5),
        pain_level INTEGER CHECK (pain_level >= 0 AND pain_level <= 10),
        cycle_phase VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, state_date)
      );
    `);
    console.log('✓ Daily states table created');

    // Insights table
    await client.query(`
      CREATE TABLE IF NOT EXISTS insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        insight_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        observed_data JSONB,
        confidence_level VARCHAR(50),
        insight_date DATE,
        metrics JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Insights table created');

    // Recommendations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        resource_type VARCHAR(50) NOT NULL,
        search_query VARCHAR(500),
        author_or_source VARCHAR(255),
        relevance_reason TEXT,
        reaction VARCHAR(20) DEFAULT NULL,
        added_to_tasks BOOLEAN DEFAULT FALSE,
        batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Recommendations table created');

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed_date ON tasks(user_id, completed_date) WHERE completed_date IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_recurring_goal ON tasks(recurring_goal_id);
      CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id) WHERE archived_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_habits_user_status ON habits(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(habit_id, log_date);
      CREATE INDEX IF NOT EXISTS idx_behavioral_logs_user ON behavioral_logs(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_daily_states_user_date ON daily_states(user_id, state_date);
      CREATE INDEX IF NOT EXISTS idx_recurring_goals_user_id ON recurring_goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_goals_active ON recurring_goals(user_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_archives_user_date ON daily_archives(user_id, archive_date);
      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_goals_category ON user_goals(category);
      CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed);
      CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);
      CREATE INDEX IF NOT EXISTS idx_recommendations_batch ON recommendations(user_id, batch_id);
    `);
    console.log('✓ Indexes created');

    // Helper function to mark onboarding complete
    await client.query(`
      CREATE OR REPLACE FUNCTION complete_onboarding(p_user_id UUID, p_onboarding_data JSONB)
      RETURNS void AS $$
      BEGIN
        UPDATE users
        SET onboarding_completed = true,
            onboarding_data = p_onboarding_data,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_user_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Helper function to reset weekly recurring-goal counters
    await client.query(`
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
    `);
    console.log('✓ Functions created');

    console.log('✅ Database initialization completed successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
    // Only close the pool if we created it (standalone run)
    if (pool === standalonePool) await pool.end();
  }
};

module.exports = initDatabase;

// Run directly: node scripts/initDatabase.js
if (require.main === module) {
  initDatabase().catch(() => process.exit(1));
}
