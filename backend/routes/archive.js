const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get archive for specific date
router.get('/date/:date', isAuthenticated, async (req, res) => {
  try {
    const { date } = req.params;

    // Get archived tasks for this date
    const tasksResult = await pool.query(
      `SELECT id, title, description, completed_at, priority_score
       FROM tasks 
       WHERE user_id = $1 
         AND completed_date = $2 
         AND deleted_at IS NULL
       ORDER BY completed_at DESC`,
      [req.user.id, date]
    );

    // Get habits completed on this date
    const habitsResult = await pool.query(
      `SELECT h.id, h.name, hl.completed, hl.notes
       FROM habits h
       JOIN habit_logs hl ON h.id = hl.habit_id
       WHERE h.user_id = $1 
         AND hl.date = $2
       ORDER BY hl.created_at DESC`,
      [req.user.id, date]
    );

    // Get daily summary
    const summaryResult = await pool.query(
      `SELECT summary, praise, tasks_completed, habits_completed
       FROM daily_archives 
       WHERE user_id = $1 AND archive_date = $2`,
      [req.user.id, date]
    );

    res.json({
      date,
      tasks: tasksResult.rows,
      habits: habitsResult.rows,
      summary: summaryResult.rows[0] || null
    });
  } catch (error) {
    console.error('Get archive by date error:', error);
    res.status(500).json({ error: 'Failed to get archive' });
  }
});

// Get archive calendar (dates with completed items)
router.get('/calendar', isAuthenticated, async (req, res) => {
  try {
    const { year, month } = req.query;

    let query = `
      SELECT 
        completed_date as date,
        COUNT(*) as count
      FROM tasks
      WHERE user_id = $1 
        AND completed_date IS NOT NULL
        AND deleted_at IS NULL
    `;
    
    const params = [req.user.id];
    
    if (year && month) {
      query += ` AND EXTRACT(YEAR FROM completed_date) = $2 
                 AND EXTRACT(MONTH FROM completed_date) = $3`;
      params.push(year, month);
    }
    
    query += ` GROUP BY completed_date ORDER BY completed_date DESC`;

    const result = await pool.query(query, params);

    res.json({ calendar: result.rows });
  } catch (error) {
    console.error('Get archive calendar error:', error);
    res.status(500).json({ error: 'Failed to get calendar' });
  }
});

// Get recent archives
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 7;

    const result = await pool.query(
      `SELECT 
        archive_date,
        tasks_completed,
        habits_completed,
        summary,
        praise
       FROM daily_archives 
       WHERE user_id = $1 
       ORDER BY archive_date DESC 
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ archives: result.rows });
  } catch (error) {
    console.error('Get recent archives error:', error);
    res.status(500).json({ error: 'Failed to get recent archives' });
  }
});

// Create/update daily archive
router.post('/daily', isAuthenticated, async (req, res) => {
  try {
    const { date, summary, praise } = req.body;
    const archiveDate = date || new Date().toISOString().split('T')[0];

    // Count completed tasks for the day
    const tasksResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM tasks 
       WHERE user_id = $1 
         AND completed_date = $2
         AND deleted_at IS NULL`,
      [req.user.id, archiveDate]
    );

    // Count completed habits for the day
    const habitsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM habit_logs hl
       JOIN habits h ON hl.habit_id = h.id
       WHERE h.user_id = $1 
         AND hl.date = $2
         AND hl.completed = true`,
      [req.user.id, archiveDate]
    );

    const tasksCompleted = parseInt(tasksResult.rows[0].count);
    const habitsCompleted = parseInt(habitsResult.rows[0].count);

    // Generate praise if not provided
    const finalPraise = praise || generateDailyPraise(tasksCompleted, habitsCompleted);

    // Insert or update daily archive
    const result = await pool.query(
      `INSERT INTO daily_archives 
       (user_id, archive_date, tasks_completed, habits_completed, summary, praise) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, archive_date) 
       DO UPDATE SET 
         tasks_completed = $3,
         habits_completed = $4,
         summary = $5,
         praise = $6
       RETURNING *`,
      [req.user.id, archiveDate, tasksCompleted, habitsCompleted, summary, finalPraise]
    );

    res.json({ 
      success: true, 
      archive: result.rows[0] 
    });
  } catch (error) {
    console.error('Create daily archive error:', error);
    res.status(500).json({ error: 'Failed to create daily archive' });
  }
});

// Get today's summary
router.get('/today', isAuthenticated, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT * FROM daily_archives 
       WHERE user_id = $1 AND archive_date = $2`,
      [req.user.id, today]
    );

    if (result.rows.length === 0) {
      // Create today's archive on the fly
      const createResult = await pool.query(
        `INSERT INTO daily_archives (user_id, archive_date, tasks_completed, habits_completed) 
         VALUES ($1, $2, 0, 0) 
         RETURNING *`,
        [req.user.id, today]
      );
      return res.json({ archive: createResult.rows[0] });
    }

    res.json({ archive: result.rows[0] });
  } catch (error) {
    console.error('Get today archive error:', error);
    res.status(500).json({ error: 'Failed to get today archive' });
  }
});

// ================================================
// Helper Functions
// ================================================

function generateDailyPraise(tasksCompleted, habitsCompleted) {
  const totalCompleted = tasksCompleted + habitsCompleted;

  if (totalCompleted === 0) {
    return "Tomorrow is a new day! Sometimes rest is just as important as productivity. 🌙";
  }

  if (totalCompleted <= 2) {
    return `You made progress today with ${totalCompleted} item${totalCompleted > 1 ? 's' : ''} completed! Every step forward counts. ✨`;
  }

  if (totalCompleted <= 5) {
    return `Great day! You completed ${totalCompleted} items. You're building momentum! 🚀`;
  }

  if (totalCompleted <= 10) {
    return `Impressive! ${totalCompleted} items completed. You're on fire! 🔥`;
  }

  return `Wow! ${totalCompleted} items completed today! You're absolutely crushing it! Take a moment to celebrate this achievement! 🎉`;
}

module.exports = router;
