const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all tasks for user (excluding deleted)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { status, includeArchived } = req.query;

    // Get parent tasks (tasks without a parent_task_id)
    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND deleted_at IS NULL) as subtask_count
      FROM tasks t
      WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.parent_task_id IS NULL
    `;

    const params = [req.user.id];

    if (status) {
      query += ` AND t.status = $2`;
      params.push(status);
    }

    if (!includeArchived) {
      query += ` AND t.archived_at IS NULL`;
    }

    query += ` ORDER BY t.priority_score DESC, t.created_at DESC`;

    const result = await pool.query(query, params);

    // Fetch subtasks for each parent task
    const tasksWithSubtasks = await Promise.all(
      result.rows.map(async (task) => {
        if (task.subtask_count > 0) {
          const subtasksResult = await pool.query(
            `SELECT id, title, status, description
             FROM tasks
             WHERE parent_task_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC`,
            [task.id]
          );
          return { ...task, subtasks: subtasksResult.rows };
        }
        return { ...task, subtasks: [] };
      })
    );

    res.json({ tasks: tasksWithSubtasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create new task
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { title, description, deadline, energy_required, parent_task_id } = req.body;

    const result = await pool.query(
      `INSERT INTO tasks 
       (user_id, title, description, deadline, energy_required, parent_task_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') 
       RETURNING *`,
      [req.user.id, title, description, deadline, energy_required, parent_task_id]
    );

    res.json({ task: result.rows[0] });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const allowedFields = ['title', 'description', 'status', 'deadline', 'energy_required', 'priority_score'];
    const setClause = [];
    const values = [];
    let paramCount = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
        paramCount++;
      }
    }
    
    // If status changed to completed, set completed_at and completed_date
    if (updates.status === 'completed') {
      setClause.push(`completed_at = CURRENT_TIMESTAMP`);
      setClause.push(`completed_date = CURRENT_DATE`);
    }
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, req.user.id);
    
    const query = `
      UPDATE tasks 
      SET ${setClause.join(', ')} 
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ task: result.rows[0] });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Clear all tasks (hard delete) - MUST be before /:id to avoid matching "clear-all" as UUID
router.delete('/clear-all', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE user_id = $1
       RETURNING id`,
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'All tasks deleted',
      count: result.rowCount
    });
  } catch (error) {
    console.error('Clear all tasks error:', error);
    res.status(500).json({ error: 'Failed to clear tasks' });
  }
});

// Delete task (soft delete)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE tasks 
       SET deleted_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get subtasks for a task
router.get('/:id/subtasks', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM tasks 
       WHERE parent_task_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [id, req.user.id]
    );
    
    res.json({ subtasks: result.rows });
  } catch (error) {
    console.error('Get subtasks error:', error);
    res.status(500).json({ error: 'Failed to get subtasks' });
  }
});

// Break down task into subtasks
router.post('/:id/breakdown', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { subtasks } = req.body;
    
    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      return res.status(400).json({ error: 'Subtasks array required' });
    }
    
    // Verify parent task exists and belongs to user
    const parentCheck = await pool.query(
      'SELECT id, title FROM tasks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );
    
    if (parentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Insert all subtasks
    const insertedSubtasks = [];
    for (const subtask of subtasks) {
      const result = await pool.query(
        `INSERT INTO tasks 
         (user_id, title, description, parent_task_id, status) 
         VALUES ($1, $2, $3, $4, 'pending') 
         RETURNING *`,
        [req.user.id, subtask.title, subtask.description || '', id]
      );
      insertedSubtasks.push(result.rows[0]);
    }
    
    res.json({
      success: true,
      parent: parentCheck.rows[0],
      subtasks: insertedSubtasks
    });
  } catch (error) {
    console.error('Task breakdown error:', error);
    res.status(500).json({ error: 'Failed to create subtasks' });
  }
});

// AI-powered task breakdown
router.post('/:id/ai-breakdown', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify task exists and belongs to user
    const taskResult = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Get user context
    const context = {
      userGoals: [],
      recentTasks: []
    };

    // Generate subtasks using LLM
    const breakdownResult = await llmService.breakdownTask(task, context);

    if (!breakdownResult.success) {
      return res.status(500).json({
        error: 'Failed to generate subtasks',
        details: breakdownResult.error
      });
    }

    // Insert generated subtasks
    const insertedSubtasks = [];
    for (const subtask of breakdownResult.subtasks) {
      const result = await pool.query(
        `INSERT INTO tasks
         (user_id, title, description, parent_task_id, status, estimated_duration)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         RETURNING *`,
        [
          req.user.id,
          subtask.title,
          subtask.description || null,
          id,
          subtask.estimated_duration || null
        ]
      );
      insertedSubtasks.push(result.rows[0]);
    }

    res.json({
      success: true,
      count: insertedSubtasks.length,
      subtasks: insertedSubtasks
    });
  } catch (error) {
    console.error('AI breakdown error:', error);
    res.status(500).json({ error: 'Failed to generate subtasks' });
  }
});

// Generate and save AI tasks
router.post('/generate-and-save', isAuthenticated, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch user's onboarding data
    const userResult = await client.query(
      'SELECT onboarding_data FROM users WHERE id = $1',
      [req.user.id]
    );

    const onboardingData = userResult.rows[0]?.onboarding_data || {};

    // Fetch active recurring goals
    const goalsResult = await client.query(
      `SELECT title, frequency, times_per_week FROM recurring_goals
       WHERE user_id = $1 AND is_active = true`,
      [req.user.id]
    );

    // Fetch recently completed tasks (last 3 days)
    const recentCompletedResult = await client.query(
      `SELECT title, completed_at FROM tasks
       WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND completed_at >= NOW() - INTERVAL '3 days'
       ORDER BY completed_at DESC`,
      [req.user.id]
    );

    // Fetch current pending tasks
    const pendingResult = await client.query(
      `SELECT title FROM tasks
       WHERE user_id = $1 AND status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL`,
      [req.user.id]
    );

    // Extract specific metrics from onboarding data
    const specificMetrics = {};
    if (onboardingData.dailyRoutine?.exerciseFrequency) {
      specificMetrics.exerciseDays = onboardingData.dailyRoutine.exerciseFrequency;
    }
    if (onboardingData.preferences?.learningMinutes) {
      specificMetrics.learningMinutes = onboardingData.preferences.learningMinutes;
    }
    if (onboardingData.preferences?.sleepHours) {
      specificMetrics.sleepHours = onboardingData.preferences.sleepHours;
    }

    // Generate tasks using smart daily prompt
    const generationResult = await llmService.generateDailyTasks({
      goalsText: onboardingData.goalsText || 'General productivity',
      focusAreas: onboardingData.focusAreas || ['Productivity'],
      workStyle: onboardingData.workStyle || onboardingData.preferences?.workStyle || 'balanced',
      specificMetrics,
      dailyRoutine: onboardingData.dailyRoutine || {},
      recurringGoals: goalsResult.rows,
      recentCompletedTasks: recentCompletedResult.rows,
      pendingTasks: pendingResult.rows
    });

    if (!generationResult.success || !generationResult.tasks) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        error: 'Failed to generate tasks',
        details: generationResult.error
      });
    }

    // Insert generated tasks
    const insertedTasks = [];
    for (const task of generationResult.tasks) {
      const result = await client.query(
        `INSERT INTO tasks (
           user_id, title, description, category, priority,
           estimated_duration, status, created_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'ai', NOW())
         RETURNING *`,
        [
          req.user.id,
          task.title,
          task.description || null,
          task.category || 'General',
          task.priority || 'medium',
          task.estimatedDuration || null
        ]
      );
      insertedTasks.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      count: insertedTasks.length,
      tasks: insertedTasks
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Task generation error:', error);
    res.status(500).json({ error: 'Failed to generate and save tasks' });
  } finally {
    client.release();
  }
});

// Archive completed tasks for the day
router.post('/archive-daily', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE tasks 
       SET archived_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 
         AND status = 'completed' 
         AND archived_at IS NULL
         AND deleted_at IS NULL
       RETURNING id`,
      [req.user.id]
    );
    
    res.json({ 
      success: true, 
      archived: result.rows.length,
      message: `${result.rows.length} tasks archived` 
    });
  } catch (error) {
    console.error('Archive tasks error:', error);
    res.status(500).json({ error: 'Failed to archive tasks' });
  }
});

// Reset daily tasks (move incomplete to next day)
router.post('/reset-daily', isAuthenticated, async (req, res) => {
  try {
    // Archive completed tasks
    await pool.query(
      `UPDATE tasks 
       SET archived_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 
         AND status = 'completed' 
         AND archived_at IS NULL
         AND deleted_at IS NULL`,
      [req.user.id]
    );
    
    // Get count of pending tasks (these carry over)
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE user_id = $1 
         AND status = 'pending' 
         AND deleted_at IS NULL
         AND archived_at IS NULL`,
      [req.user.id]
    );
    
    res.json({ 
      success: true, 
      message: 'Daily reset complete',
      pendingTasksCarriedOver: parseInt(pendingResult.rows[0].count)
    });
  } catch (error) {
    console.error('Reset daily tasks error:', error);
    res.status(500).json({ error: 'Failed to reset daily tasks' });
  }
});

module.exports = router;