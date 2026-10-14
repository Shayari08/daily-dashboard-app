const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = require('../config/db');

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
    let breakdownResult = await llmService.breakdownTask(task, context);

    if (!breakdownResult || !breakdownResult.success || !Array.isArray(breakdownResult.subtasks) || breakdownResult.subtasks.length === 0) {
      const fallbackSubtasks = (typeof llmService.generateFallbackSubtasks === 'function')
        ? llmService.generateFallbackSubtasks(task)
        : [
            { title: `Plan and outline: ${task.title}`, description: 'Clarify steps and required inputs', estimated_duration: 15 },
            { title: `Execute core work: ${task.title}`, description: 'Focus on completing the main deliverable', estimated_duration: 30 },
            { title: `Review and finalize: ${task.title}`, description: 'Check quality and mark done', estimated_duration: 15 }
          ];
      breakdownResult = { success: true, subtasks: fallbackSubtasks };
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

    // Fetch recently completed tasks (last 14 days) with category for progress analysis
    const recentCompletedResult = await client.query(
      `SELECT title, category, completed_at FROM tasks
       WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND completed_at >= NOW() - INTERVAL '14 days'
       ORDER BY completed_at DESC
       LIMIT 40`,
      [req.user.id]
    );

    // Progress per category over last 30 days
    const progressResult = await client.query(
      `SELECT category, COUNT(*) AS completed_count
       FROM tasks
       WHERE user_id = $1 AND status = 'completed' AND deleted_at IS NULL
         AND completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY category
       ORDER BY completed_count DESC`,
      [req.user.id]
    );

    // Fetch current pending tasks
    const pendingResult = await client.query(
      `SELECT title, category FROM tasks
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
      categoryProgress: progressResult.rows,
      pendingTasks: pendingResult.rows
    });

    let generatedTasks = [];

    if (generationResult.success && Array.isArray(generationResult.tasks) && generationResult.tasks.length > 0) {
      generatedTasks = generationResult.tasks;
    } else {
      console.warn('LLM task generation unavailable, using smart tailored fallback generator');
      const areaTaskPool = {
        'health': [
          { title: 'Do 20 minutes of cardio or brisk walk', description: 'Get heart rate up and boost daytime energy', category: 'Health & Fitness', estimatedDuration: 20, priority: 'medium' },
          { title: 'Drink a glass of water and stretch for 10 minutes', description: 'Relieve muscle stiffness and stay hydrated', category: 'Health & Fitness', estimatedDuration: 10, priority: 'low' },
          { title: 'Cook or prepare a nutrient-dense balanced lunch', description: 'Fuel your afternoon with clean energy', category: 'Health & Fitness', estimatedDuration: 25, priority: 'medium' }
        ],
        'career': [
          { title: 'Complete 1 learning module or lesson in your course', description: 'Dedicated 30-minute skill-building sprint', category: 'Career & Learning', estimatedDuration: 30, priority: 'high' },
          { title: 'Read 15 pages of your technical/business book', description: 'Take quick notes on the top takeaway', category: 'Career & Learning', estimatedDuration: 20, priority: 'medium' },
          { title: 'Refine 1 section of your portfolio or project', description: 'Ship an incremental improvement to career materials', category: 'Career & Learning', estimatedDuration: 25, priority: 'medium' }
        ],
        'productivity': [
          { title: 'Complete your top priority task before noon', description: 'Single-task with zero distractions until done', category: 'Productivity', estimatedDuration: 45, priority: 'high' },
          { title: '15-minute inbox zero and desktop sweep', description: 'Clear out digital clutter and pending emails', category: 'Productivity', estimatedDuration: 15, priority: 'low' },
          { title: 'Run a 25-minute Pomodoro focus block on main project', description: 'Work in a timed burst without checking notifications', category: 'Productivity', estimatedDuration: 25, priority: 'medium' }
        ],
        'finance': [
          { title: 'Review and categorize bank transactions from past week', description: 'Ensure budget totals match reality', category: 'Finance', estimatedDuration: 15, priority: 'medium' },
          { title: 'Check subscriptions and cancel any unused services', description: 'Save on recurring expenses', category: 'Finance', estimatedDuration: 15, priority: 'low' },
          { title: 'Log today\'s expenses into your tracker or spreadsheet', description: 'Track spending for accurate weekly overview', category: 'Finance', estimatedDuration: 10, priority: 'low' }
        ],
        'relationships': [
          { title: 'Reach out to a close friend or family member for a check-in', description: 'Send a thoughtful text or make a 10-minute call', category: 'Relationships', estimatedDuration: 15, priority: 'medium' },
          { title: 'Plan an intentional meal or outing with someone close', description: 'Strengthen bonds through dedicated quality time', category: 'Relationships', estimatedDuration: 15, priority: 'medium' }
        ],
        'creativity': [
          { title: '20-minute creative writing, sketching, or brainstorming session', description: 'Generate fresh concepts without judging the output', category: 'Creativity', estimatedDuration: 20, priority: 'medium' },
          { title: 'Curate 3 inspiring references for your creative project', description: 'Save high-quality inspiration for future work', category: 'Creativity', estimatedDuration: 15, priority: 'low' }
        ],
        'mindfulness': [
          { title: 'Complete a 10-minute mindful breathing or meditation session', description: 'Reset your nervous system and refocus your mind', category: 'Mindfulness', estimatedDuration: 10, priority: 'medium' },
          { title: 'Write down 3 specific things you are grateful for today', description: 'Notice small positive moments from the day', category: 'Mindfulness', estimatedDuration: 5, priority: 'low' }
        ]
      };

      const pendingTitles = new Set((pendingResult.rows || []).map(t => (t.title || '').toLowerCase()));
      const selectedAreas = (onboardingData.focusAreas && onboardingData.focusAreas.length > 0)
        ? onboardingData.focusAreas
        : ['productivity', 'health', 'career'];

      for (const area of selectedAreas) {
        const key = area.toLowerCase().includes('health') ? 'health'
          : area.toLowerCase().includes('career') ? 'career'
          : area.toLowerCase().includes('prod') ? 'productivity'
          : area.toLowerCase().includes('finan') ? 'finance'
          : area.toLowerCase().includes('relat') ? 'relationships'
          : area.toLowerCase().includes('creat') ? 'creativity'
          : area.toLowerCase().includes('mind') ? 'mindfulness'
          : 'productivity';

        const poolItems = areaTaskPool[key] || areaTaskPool.productivity;
        for (const item of poolItems) {
          if (!pendingTitles.has(item.title.toLowerCase()) && !generatedTasks.some(gt => gt.title === item.title)) {
            generatedTasks.push(item);
            break; // 1 per focus area
          }
        }
      }

      if (generatedTasks.length === 0) {
        generatedTasks.push(
          { title: 'Identify top 3 priority tasks for today', description: 'Clarify high-impact work before diving in', category: 'Productivity', estimatedDuration: 15, priority: 'high' },
          { title: 'Do a 20-minute focused working session', description: 'Concentrate on one single deliverable', category: 'Productivity', estimatedDuration: 20, priority: 'medium' },
          { title: 'Take a 15-minute walk or movement break', description: 'Step away from screen to recharge energy', category: 'Health & Fitness', estimatedDuration: 15, priority: 'low' }
        );
      }
    }

    // Insert generated tasks
    const insertedTasks = [];
    for (const task of generatedTasks) {
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