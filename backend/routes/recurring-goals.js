const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper: Get current day of week
const getDayOfWeek = () => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
};

// Helper: Check if we're in a new week
const isNewWeek = (weekStartDate) => {
  if (!weekStartDate) return true;
  const now = new Date();
  const weekStart = new Date(weekStartDate);
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
  currentWeekStart.setHours(0, 0, 0, 0);
  return weekStart < currentWeekStart;
};

// Helper: Smart day distribution for "X times per week"
const getDistributedDays = (timesPerWeek) => {
  const distributions = {
    1: ['wednesday'],
    2: ['tuesday', 'friday'],
    3: ['monday', 'wednesday', 'friday'],
    4: ['monday', 'tuesday', 'thursday', 'friday'],
    5: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    7: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  };
  return distributions[timesPerWeek] || distributions[3];
};

// Helper: Update goal streak based on completion logs
async function updateGoalStreak(goalId, completedDate) {
  try {
    const logsResult = await pool.query(
      `SELECT date FROM goal_completion_logs
       WHERE goal_id = $1 AND completed = true
       ORDER BY date DESC
       LIMIT 100`,
      [goalId]
    );

    if (logsResult.rows.length === 0) {
      await pool.query(
        `UPDATE recurring_goals SET streak = 1, best_streak = GREATEST(best_streak, 1),
         last_completed_date = $1 WHERE id = $2`,
        [completedDate, goalId]
      );
      return;
    }

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

    await pool.query(
      `UPDATE recurring_goals
       SET streak = $1,
           best_streak = GREATEST(best_streak, $1),
           last_completed_date = $2
       WHERE id = $3`,
      [streak, completedDate, goalId]
    );
  } catch (error) {
    console.error('Update goal streak error:', error);
  }
}

// ================================================
// GET /api/recurring-goals - Get all recurring goals
// ================================================
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM recurring_goals
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, goals: result.rows });
  } catch (error) {
    console.error('Get recurring goals error:', error);
    res.status(500).json({ error: 'Failed to fetch recurring goals' });
  }
});

// ================================================
// POST /api/recurring-goals - Create a new recurring goal
// ================================================
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      frequency,
      timesPerWeek,
      specificDays,
      preferredTime,
      durationMinutes
    } = req.body;

    if (!title || !frequency) {
      return res.status(400).json({ error: 'Title and frequency are required' });
    }

    const result = await pool.query(
      `INSERT INTO recurring_goals
       (user_id, title, description, category, frequency, times_per_week,
        specific_days, preferred_time, duration_minutes, week_start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
       RETURNING *`,
      [
        req.user.id,
        title,
        description || null,
        category || 'General',
        frequency,
        timesPerWeek || 1,
        specificDays || null,
        preferredTime || 'any',
        durationMinutes || null
      ]
    );

    res.json({ success: true, goal: result.rows[0] });
  } catch (error) {
    console.error('Create recurring goal error:', error);
    res.status(500).json({ error: 'Failed to create recurring goal' });
  }
});

// ================================================
// PATCH /api/recurring-goals/:id - Update a recurring goal
// ================================================
router.patch('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const allowedFields = ['title', 'description', 'category', 'frequency',
                           'times_per_week', 'specific_days', 'preferred_time',
                           'duration_minutes', 'is_active'];

    const setClauses = [];
    const values = [id, req.user.id];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(
      `UPDATE recurring_goals
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, goal: result.rows[0] });
  } catch (error) {
    console.error('Update recurring goal error:', error);
    res.status(500).json({ error: 'Failed to update recurring goal' });
  }
});

// ================================================
// DELETE /api/recurring-goals/:id - Delete a recurring goal
// ================================================
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM recurring_goals
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    console.error('Delete recurring goal error:', error);
    res.status(500).json({ error: 'Failed to delete recurring goal' });
  }
});

// ================================================
// POST /api/recurring-goals/:id/complete - Mark goal completed for today
// ================================================
router.post('/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const todayDate = new Date().toISOString().split('T')[0];

    // First reset if new week
    await pool.query(
      `UPDATE recurring_goals
       SET times_completed_this_week = 0, week_start_date = CURRENT_DATE
       WHERE user_id = $1 AND week_start_date < DATE_TRUNC('week', CURRENT_DATE)`,
      [req.user.id]
    );

    // Check if already completed today
    const check = await pool.query(
      `SELECT last_completed_date FROM recurring_goals WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const lastCompleted = check.rows[0].last_completed_date;
    if (lastCompleted && new Date(lastCompleted).toISOString().split('T')[0] === todayDate) {
      return res.status(400).json({ error: 'Already completed today', alreadyDone: true });
    }

    // Insert completion log
    await pool.query(
      `INSERT INTO goal_completion_logs (goal_id, user_id, date, completed)
       VALUES ($1, $2, CURRENT_DATE, true)
       ON CONFLICT (goal_id, date) DO NOTHING`,
      [id, req.user.id]
    );

    const result = await pool.query(
      `UPDATE recurring_goals
       SET times_completed_this_week = times_completed_this_week + 1,
           last_completed_date = CURRENT_DATE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    // Update streak in background
    await updateGoalStreak(id, todayDate);

    // Re-fetch with updated streak
    const updated = await pool.query(
      `SELECT * FROM recurring_goals WHERE id = $1`, [id]
    );

    res.json({ success: true, goal: updated.rows[0] });
  } catch (error) {
    console.error('Complete goal error:', error);
    res.status(500).json({ error: 'Failed to mark goal complete' });
  }
});

// ================================================
// POST /api/recurring-goals/generate-daily-tasks - Generate tasks for today
// ================================================
router.post('/generate-daily-tasks', isAuthenticated, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const today = getDayOfWeek();
    const todayDate = new Date().toISOString().split('T')[0];

    // Reset weekly counters if new week
    await client.query(
      `UPDATE recurring_goals
       SET times_completed_this_week = 0,
           week_start_date = CURRENT_DATE,
           tasks_generated_today = FALSE
       WHERE user_id = $1
         AND week_start_date < DATE_TRUNC('week', CURRENT_DATE)`,
      [req.user.id]
    );

    // Get all active recurring goals
    const goalsResult = await client.query(
      `SELECT * FROM recurring_goals
       WHERE user_id = $1
         AND is_active = true
         AND (last_generated_date IS NULL OR last_generated_date < $2)`,
      [req.user.id, todayDate]
    );

    const tasksToCreate = [];

    for (const goal of goalsResult.rows) {
      let shouldGenerate = false;

      switch (goal.frequency) {
        case 'daily':
          shouldGenerate = true;
          break;

        case 'specific_days':
          if (goal.specific_days && goal.specific_days.includes(today)) {
            shouldGenerate = true;
          }
          break;

        case 'x_per_week':
        case 'weekly':
          // Check if we haven't hit the weekly limit
          if (goal.times_completed_this_week < goal.times_per_week) {
            // Check if today is a "good" day based on distribution
            const distributedDays = getDistributedDays(goal.times_per_week);

            // Calculate how many days left in the week
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const todayIndex = daysOfWeek.indexOf(today);
            const daysRemaining = 7 - todayIndex;
            const tasksRemaining = goal.times_per_week - goal.times_completed_this_week;

            // Generate if it's a distributed day OR if we need to catch up
            if (distributedDays.includes(today) || tasksRemaining >= daysRemaining) {
              shouldGenerate = true;
            }
          }
          break;
      }

      if (shouldGenerate) {
        tasksToCreate.push({
          goalId: goal.id,
          title: goal.title,
          description: goal.description,
          category: goal.category,
          durationMinutes: goal.duration_minutes
        });
      }
    }

    // Create tasks
    const createdTasks = [];
    for (const taskData of tasksToCreate) {
      const taskResult = await client.query(
        `INSERT INTO tasks
         (user_id, title, description, status, created_by, created_at)
         VALUES ($1, $2, $3, 'pending', 'ai', NOW())
         RETURNING *`,
        [
          req.user.id,
          taskData.title,
          taskData.description
        ]
      );
      createdTasks.push(taskResult.rows[0]);

      // Mark goal as generated today
      await client.query(
        `UPDATE recurring_goals
         SET last_generated_date = $1, tasks_generated_today = true
         WHERE id = $2`,
        [todayDate, taskData.goalId]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Generated ${createdTasks.length} tasks for today`,
      tasks: createdTasks
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Generate daily tasks error:', error);
    res.status(500).json({ error: 'Failed to generate daily tasks' });
  } finally {
    client.release();
  }
});

// ================================================
// GET /api/recurring-goals/today-status - Get today's goal status
// ================================================
router.get('/today-status', isAuthenticated, async (req, res) => {
  try {
    const today = getDayOfWeek();

    const result = await pool.query(
      `SELECT
         rg.*,
         COALESCE(rg.streak, 0) as streak,
         COALESCE(rg.best_streak, 0) as best_streak,
         COALESCE(cl.total_completions, 0) as total_completions,
         CASE
           WHEN rg.last_completed_date = CURRENT_DATE THEN true
           ELSE false
         END as completed_today,
         CASE
           WHEN rg.last_completed_date = CURRENT_DATE THEN false
           WHEN rg.frequency = 'daily' THEN true
           WHEN rg.frequency = 'specific_days' AND $2 = ANY(rg.specific_days) THEN true
           WHEN rg.frequency IN ('x_per_week', 'weekly')
                AND rg.times_completed_this_week < rg.times_per_week THEN true
           ELSE false
         END as due_today,
         CASE
           WHEN rg.frequency IN ('x_per_week', 'weekly') THEN
             rg.times_per_week - rg.times_completed_this_week
           ELSE NULL
         END as remaining_this_week
       FROM recurring_goals rg
       LEFT JOIN (
         SELECT goal_id, COUNT(*) as total_completions
         FROM goal_completion_logs
         WHERE completed = true
         GROUP BY goal_id
       ) cl ON cl.goal_id = rg.id
       WHERE rg.user_id = $1 AND rg.is_active = true
       ORDER BY due_today DESC, rg.created_at DESC`,
      [req.user.id, today]
    );

    res.json({ success: true, goals: result.rows, today });
  } catch (error) {
    console.error('Get today status error:', error);
    res.status(500).json({ error: 'Failed to fetch today status' });
  }
});

module.exports = router;
