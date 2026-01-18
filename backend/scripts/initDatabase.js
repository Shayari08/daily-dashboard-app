const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const initDatabase = async () => {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ User profiles table created');

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        deadline TIMESTAMP,
        energy_required INTEGER CHECK (energy_required >= 1 AND energy_required <= 5),
        priority_score FLOAT DEFAULT 0,
        user_order INTEGER,
        estimated_duration INTEGER,
        created_by VARCHAR(50) DEFAULT 'user',
        ai_reasoning TEXT,
        completed_at TIMESTAMP,
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
        status VARCHAR(50) DEFAULT 'suggested',
        detection_evidence TEXT,
        ai_reasoning TEXT,
        accepted_at TIMESTAMP,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Insights table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
      CREATE INDEX IF NOT EXISTS idx_behavioral_logs_user ON behavioral_logs(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_habits_user_status ON habits(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(habit_id, log_date);
      CREATE INDEX IF NOT EXISTS idx_daily_states_user_date ON daily_states(user_id, state_date);
    `);
    console.log('✓ Indexes created');

    console.log('✅ Database initialization completed successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

initDatabase();
