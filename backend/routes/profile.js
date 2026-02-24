const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get user profile
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile (onboarding)
router.put('/', isAuthenticated, async (req, res) => {
  try {
    const {
      short_term_goals,
      long_term_goals,
      work_hours_start,
      work_hours_end,
      preferred_task_length,
      energy_pattern,
      strictness_level,
      notification_preferences,
      track_energy,
      track_pain,
      track_cycle,
      onboarding_completed
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (short_term_goals !== undefined) {
      updates.push(`short_term_goals = $${paramCount++}`);
      values.push(short_term_goals);
    }
    if (long_term_goals !== undefined) {
      updates.push(`long_term_goals = $${paramCount++}`);
      values.push(long_term_goals);
    }
    if (work_hours_start !== undefined) {
      updates.push(`work_hours_start = $${paramCount++}`);
      values.push(work_hours_start);
    }
    if (work_hours_end !== undefined) {
      updates.push(`work_hours_end = $${paramCount++}`);
      values.push(work_hours_end);
    }
    if (preferred_task_length !== undefined) {
      updates.push(`preferred_task_length = $${paramCount++}`);
      values.push(preferred_task_length);
    }
    if (energy_pattern !== undefined) {
      updates.push(`energy_pattern = $${paramCount++}`);
      values.push(energy_pattern);
    }
    if (strictness_level !== undefined) {
      updates.push(`strictness_level = $${paramCount++}`);
      values.push(strictness_level);
    }
    if (notification_preferences !== undefined) {
      updates.push(`notification_preferences = $${paramCount++}`);
      values.push(JSON.stringify(notification_preferences));
    }
    if (track_energy !== undefined) {
      updates.push(`track_energy = $${paramCount++}`);
      values.push(track_energy);
    }
    if (track_pain !== undefined) {
      updates.push(`track_pain = $${paramCount++}`);
      values.push(track_pain);
    }
    if (track_cycle !== undefined) {
      updates.push(`track_cycle = $${paramCount++}`);
      values.push(track_cycle);
    }
    if (onboarding_completed !== undefined) {
      updates.push(`onboarding_completed = $${paramCount++}`);
      values.push(onboarding_completed);
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);
    
    const result = await pool.query(
      `UPDATE user_profiles SET ${updates.join(', ')} 
       WHERE user_id = $${paramCount}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get or create daily state
router.get('/state/:date?', isAuthenticated, async (req, res) => {
  try {
    const date = req.params.date || new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT * FROM daily_states WHERE user_id = $1 AND state_date = $2',
      [req.user.id, date]
    );
    
    if (result.rows.length === 0) {
      return res.json({ state: null });
    }
    
    res.json({ state: result.rows[0] });
  } catch (error) {
    console.error('Error fetching daily state:', error);
    res.status(500).json({ error: 'Failed to fetch daily state' });
  }
});

// Update daily state
router.post('/state', isAuthenticated, async (req, res) => {
  try {
    const {
      state_date = new Date().toISOString().split('T')[0],
      energy_level,
      pain_level,
      cycle_phase,
      notes
    } = req.body;
    
    // Check if state exists
    const existing = await pool.query(
      'SELECT id FROM daily_states WHERE user_id = $1 AND state_date = $2',
      [req.user.id, state_date]
    );
    
    if (existing.rows.length > 0) {
      // Update existing
      const updates = [];
      const values = [];
      let paramCount = 1;
      
      if (energy_level !== undefined) {
        updates.push(`energy_level = $${paramCount++}`);
        values.push(energy_level);
      }
      if (pain_level !== undefined) {
        updates.push(`pain_level = $${paramCount++}`);
        values.push(pain_level);
      }
      if (cycle_phase !== undefined) {
        updates.push(`cycle_phase = $${paramCount++}`);
        values.push(cycle_phase);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(notes);
      }
      
      values.push(existing.rows[0].id);
      
      const result = await pool.query(
        `UPDATE daily_states SET ${updates.join(', ')} 
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      
      return res.json({ state: result.rows[0] });
    }
    
    // Create new
    const result = await pool.query(
      `INSERT INTO daily_states 
       (user_id, state_date, energy_level, pain_level, cycle_phase, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [req.user.id, state_date, energy_level, pain_level, cycle_phase, notes]
    );
    
    res.status(201).json({ state: result.rows[0] });
  } catch (error) {
    console.error('Error updating daily state:', error);
    res.status(500).json({ error: 'Failed to update daily state' });
  }
});

// Get state history
router.get('/state-history', isAuthenticated, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM daily_states 
       WHERE user_id = $1 
       AND state_date > CURRENT_DATE - INTERVAL '${parseInt(days)} days'
       ORDER BY state_date DESC`,
      [req.user.id]
    );
    
    res.json({ states: result.rows });
  } catch (error) {
    console.error('Error fetching state history:', error);
    res.status(500).json({ error: 'Failed to fetch state history' });
  }
});

// Reset goals
router.delete('/goals', isAuthenticated, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete from user_goals table (if it exists)
    await client.query('SAVEPOINT user_goals_check');
    try {
      await client.query('DELETE FROM user_goals WHERE user_id = $1', [req.user.id]);
      await client.query('RELEASE SAVEPOINT user_goals_check');
    } catch (e) {
      // user_goals table may not exist if onboarding SQL wasn't run
      await client.query('ROLLBACK TO SAVEPOINT user_goals_check');
      console.log('user_goals table not found, skipping');
    }

    // Clear goals fields in user_profiles
    await client.query(
      `UPDATE user_profiles
       SET short_term_goals = NULL,
           long_term_goals = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [req.user.id]
    );

    // Remove goals from users.onboarding_data
    await client.query(
      `UPDATE users
       SET onboarding_data = NULL,
           onboarding_completed = false
       WHERE id = $1`,
      [req.user.id]
    );

    // Delete AI-generated/suggested tasks (keep user-entered ones)
    const deletedTasks = await client.query(
      `DELETE FROM tasks
       WHERE user_id = $1 AND created_by != 'user'
       RETURNING id`,
      [req.user.id]
    );

    // Delete all habit logs first (then habits)
    await client.query(
      `DELETE FROM habit_logs
       WHERE habit_id IN (SELECT id FROM habits WHERE user_id = $1)`,
      [req.user.id]
    );

    // Delete all habits
    const deletedHabits = await client.query(
      `DELETE FROM habits WHERE user_id = $1 RETURNING id`,
      [req.user.id]
    );

    // Delete recurring goals
    await client.query('SAVEPOINT recurring_goals_check');
    try {
      await client.query(
        `DELETE FROM recurring_goals WHERE user_id = $1`,
        [req.user.id]
      );
      await client.query('RELEASE SAVEPOINT recurring_goals_check');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT recurring_goals_check');
      console.log('recurring_goals table not found, skipping');
    }

    // Delete user preferences
    await client.query('SAVEPOINT preferences_check');
    try {
      await client.query(
        `DELETE FROM user_preferences WHERE user_id = $1`,
        [req.user.id]
      );
      await client.query('RELEASE SAVEPOINT preferences_check');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT preferences_check');
      console.log('user_preferences table not found, skipping');
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Goals reset successfully',
      deletedTasks: deletedTasks.rowCount,
      deletedHabits: deletedHabits.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset goals error:', error);
    res.status(500).json({ error: 'Failed to reset goals' });
  } finally {
    client.release();
  }
});

// Delete account (CASCADE handles all related data)
router.delete('/account', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete user (CASCADE will delete all related data)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    // Logout user
    req.logout((err) => {
      if (err) {
        console.error('Logout error after account deletion:', err);
      }
      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
