const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all habits
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { includeArchived } = req.query;
    
    let query = `
      SELECT h.*,
        (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND completed = true) as total_completions,
        (SELECT date FROM habit_logs WHERE habit_id = h.id ORDER BY date DESC LIMIT 1) as last_logged
      FROM habits h
      WHERE h.user_id = $1
    `;
    
    if (!includeArchived) {
      query += ` AND h.archived_at IS NULL`;
    }
    
    query += ` ORDER BY h.created_at DESC`;
    
    const result = await pool.query(query, [req.user.id]);
    
    res.json({ habits: result.rows });
  } catch (error) {
    console.error('Get habits error:', error);
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

// Create new habit
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { name, frequency, frequency_data } = req.body;
    
    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'custom'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency type' });
    }
    
    const result = await pool.query(
      `INSERT INTO habits 
       (user_id, name, frequency, frequency_data) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [req.user.id, name, frequency, JSON.stringify(frequency_data || {})]
    );
    
    res.json({ habit: result.rows[0] });
  } catch (error) {
    console.error('Create habit error:', error);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// Update habit
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, frequency, frequency_data } = req.body;
    
    const result = await pool.query(
      `UPDATE habits 
       SET name = COALESCE($1, name),
           frequency = COALESCE($2, frequency),
           frequency_data = COALESCE($3, frequency_data),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5 AND archived_at IS NULL
       RETURNING *`,
      [name, frequency, frequency_data ? JSON.stringify(frequency_data) : null, id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    res.json({ habit: result.rows[0] });
  } catch (error) {
    console.error('Update habit error:', error);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// Archive habit
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE habits 
       SET archived_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    res.json({ success: true, message: 'Habit archived' });
  } catch (error) {
    console.error('Archive habit error:', error);
    res.status(500).json({ error: 'Failed to archive habit' });
  }
});

// Log habit completion
router.post('/:id/log', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { completed = true, date, notes } = req.body;
    const logDate = date || new Date().toISOString().split('T')[0];
    
    // Verify habit exists
    const habitCheck = await pool.query(
      'SELECT * FROM habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
      [id, req.user.id]
    );
    
    if (habitCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    const habit = habitCheck.rows[0];
    
    // Insert or update log
    const result = await pool.query(
      `INSERT INTO habit_logs (habit_id, date, completed, notes) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (habit_id, date) 
       DO UPDATE SET completed = $3, notes = $4
       RETURNING *`,
      [id, logDate, completed, notes]
    );
    
    // Update streak
    if (completed) {
      await updateHabitStreak(id, logDate);
    }
    
    res.json({ 
      success: true, 
      log: result.rows[0],
      habit: habit 
    });
  } catch (error) {
    console.error('Log habit error:', error);
    res.status(500).json({ error: 'Failed to log habit' });
  }
});

// Get habit logs
router.get('/:id/logs', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 30 } = req.query;
    
    const result = await pool.query(
      `SELECT hl.* 
       FROM habit_logs hl
       JOIN habits h ON hl.habit_id = h.id
       WHERE h.id = $1 AND h.user_id = $2
       ORDER BY hl.date DESC
       LIMIT $3`,
      [id, req.user.id, limit]
    );
    
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Get habit logs error:', error);
    res.status(500).json({ error: 'Failed to get habit logs' });
  }
});

// Get habit stats
router.get('/:id/stats', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get habit details with streak
    const habitResult = await pool.query(
      'SELECT * FROM habits WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (habitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    // Get completion stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE completed = true) as total_completed,
        COUNT(*) as total_logged,
        MAX(date) as last_completed_date
       FROM habit_logs 
       WHERE habit_id = $1`,
      [id]
    );
    
    // Get completion rate for last 30 days
    const recentResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE completed = true) as completed,
        COUNT(*) as total
       FROM habit_logs 
       WHERE habit_id = $1 
         AND date >= CURRENT_DATE - INTERVAL '30 days'`,
      [id]
    );
    
    const habit = habitResult.rows[0];
    const stats = statsResult.rows[0];
    const recent = recentResult.rows[0];
    
    const completionRate = recent.total > 0 
      ? Math.round((recent.completed / recent.total) * 100) 
      : 0;
    
    res.json({
      habit,
      stats: {
        currentStreak: habit.streak || 0,
        bestStreak: habit.best_streak || 0,
        totalCompletions: parseInt(stats.total_completed) || 0,
        lastCompleted: stats.last_completed_date,
        completionRate30Days: completionRate
      }
    });
  } catch (error) {
    console.error('Get habit stats error:', error);
    res.status(500).json({ error: 'Failed to get habit stats' });
  }
});

// ================================================
// Helper Functions
// ================================================

async function updateHabitStreak(habitId, completedDate) {
  try {
    // Get recent logs ordered by date
    const logsResult = await pool.query(
      `SELECT date FROM habit_logs 
       WHERE habit_id = $1 AND completed = true 
       ORDER BY date DESC 
       LIMIT 100`,
      [habitId]
    );
    
    if (logsResult.rows.length === 0) {
      await pool.query(
        'UPDATE habits SET streak = 0, last_completed = $1 WHERE id = $2',
        [completedDate, habitId]
      );
      return;
    }
    
    // Calculate current streak
    let streak = 1;
    const dates = logsResult.rows.map(r => new Date(r.date));
    
    for (let i = 0; i < dates.length - 1; i++) {
      const dayDiff = Math.floor((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        streak++;
      } else {
        break;
      }
    }
    
    // Update habit with new streak
    await pool.query(
      `UPDATE habits 
       SET streak = $1, 
           best_streak = GREATEST(best_streak, $1),
           last_completed = $2
       WHERE id = $3`,
      [streak, completedDate, habitId]
    );
    
  } catch (error) {
    console.error('Update streak error:', error);
  }
}

module.exports = router;
