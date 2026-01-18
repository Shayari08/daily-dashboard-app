const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Calculate priority score for a task
function calculatePriorityScore(task, userContext = {}) {
  let score = 0;
  
  // Urgency factor (deadline)
  if (task.deadline) {
    const daysUntilDeadline = (new Date(task.deadline) - new Date()) / (1000 * 60 * 60 * 24);
    if (daysUntilDeadline < 1) score += 50;
    else if (daysUntilDeadline < 3) score += 30;
    else if (daysUntilDeadline < 7) score += 15;
  }
  
  // Energy alignment
  if (task.energy_required && userContext.current_energy) {
    const energyDiff = Math.abs(task.energy_required - userContext.current_energy);
    score += (5 - energyDiff) * 5; // Reward energy alignment
  }
  
  // Historical success rate (to be implemented with behavior logs)
  // For now, default weight
  score += 10;
  
  return score;
}

// Get all tasks for user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM tasks 
       WHERE user_id = $1 AND status = $2 
       ORDER BY priority_score DESC, created_at DESC`,
      [req.user.id, status]
    );
    
    res.json({ tasks: result.rows });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get subtasks if any
    const subtasksResult = await pool.query(
      'SELECT * FROM tasks WHERE parent_task_id = $1 ORDER BY user_order',
      [req.params.id]
    );
    
    res.json({
      task: result.rows[0],
      subtasks: subtasksResult.rows
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create task manually
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { title, description, deadline, energy_required, estimated_duration } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const priority_score = calculatePriorityScore({ deadline, energy_required });
    
    const result = await pool.query(
      `INSERT INTO tasks 
       (user_id, title, description, deadline, energy_required, estimated_duration, priority_score, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [req.user.id, title, description, deadline, energy_required, estimated_duration, priority_score, 'user']
    );
    
    // Log the creation
    await pool.query(
      `INSERT INTO behavioral_logs (user_id, task_id, action_type, context) 
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, result.rows[0].id, 'task_created', JSON.stringify({ created_by: 'user' })]
    );
    
    res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Generate AI task suggestions
router.post('/generate', isAuthenticated, async (req, res) => {
  try {
    const { goals, context } = req.body;
    
    // Get user's goals from profile if not provided
    let userGoals = goals;
    if (!userGoals) {
      const profileResult = await pool.query(
        'SELECT short_term_goals, long_term_goals FROM user_profiles WHERE user_id = $1',
        [req.user.id]
      );
      
      if (profileResult.rows.length > 0) {
        const profile = profileResult.rows[0];
        userGoals = [...(profile.short_term_goals || []), ...(profile.long_term_goals || [])];
      }
    }
    
    if (!userGoals || userGoals.length === 0) {
      return res.status(400).json({ error: 'No goals available for task generation' });
    }
    
    const response = await llmService.generateTaskSuggestions(userGoals, context);
    
    if (!response.success) {
      return res.status(500).json({ 
        error: 'Failed to generate tasks',
        fallback: response.fallback 
      });
    }
    
    res.json({ suggestions: response.tasks });
  } catch (error) {
    console.error('Error generating tasks:', error);
    res.status(500).json({ error: 'Failed to generate task suggestions' });
  }
});

// Accept AI suggestion and create task
router.post('/accept-suggestion', isAuthenticated, async (req, res) => {
  try {
    const { title, description, energy_required, reasoning } = req.body;
    
    const priority_score = calculatePriorityScore({ energy_required });
    
    const result = await pool.query(
      `INSERT INTO tasks 
       (user_id, title, description, energy_required, priority_score, created_by, ai_reasoning) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [req.user.id, title, description, energy_required, priority_score, 'ai', reasoning]
    );
    
    await pool.query(
      `INSERT INTO behavioral_logs (user_id, task_id, action_type, context) 
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, result.rows[0].id, 'task_created', JSON.stringify({ created_by: 'ai', accepted: true })]
    );
    
    res.status(201).json({ task: result.rows[0] });
  } catch (error) {
    console.error('Error accepting suggestion:', error);
    res.status(500).json({ error: 'Failed to accept suggestion' });
  }
});

// Break down task into subtasks
router.post('/:id/breakdown', isAuthenticated, async (req, res) => {
  try {
    const taskResult = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = taskResult.rows[0];
    const response = await llmService.breakdownTask(task, req.body.context);
    
    if (!response.success) {
      return res.status(500).json({ error: 'Failed to breakdown task' });
    }
    
    res.json({ 
      subtasks: response.subtasks,
      reasoning: response.reasoning
    });
  } catch (error) {
    console.error('Error breaking down task:', error);
    res.status(500).json({ error: 'Failed to breakdown task' });
  }
});

// Accept subtask breakdown
router.post('/:id/accept-breakdown', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { subtasks } = req.body;
    const createdSubtasks = [];
    
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const result = await client.query(
        `INSERT INTO tasks 
         (user_id, title, description, parent_task_id, estimated_duration, user_order, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [req.user.id, subtask.title, subtask.description, req.params.id, subtask.estimated_duration, i, 'ai']
      );
      createdSubtasks.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    res.status(201).json({ subtasks: createdSubtasks });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error accepting breakdown:', error);
    res.status(500).json({ error: 'Failed to create subtasks' });
  } finally {
    client.release();
  }
});

// Update task
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { title, description, deadline, energy_required, status, user_order } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (deadline !== undefined) {
      updates.push(`deadline = $${paramCount++}`);
      values.push(deadline);
    }
    if (energy_required !== undefined) {
      updates.push(`energy_required = $${paramCount++}`);
      values.push(energy_required);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
      if (status === 'completed') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      }
    }
    if (user_order !== undefined) {
      updates.push(`user_order = $${paramCount++}`);
      values.push(user_order);
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id, req.user.id);
    
    const result = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} 
       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Log the update
    await pool.query(
      `INSERT INTO behavioral_logs (user_id, task_id, action_type, context) 
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, req.params.id, 'task_updated', JSON.stringify({ updates: Object.keys(req.body) })]
    );
    
    // Recalculate priority if relevant fields changed
    if (deadline !== undefined || energy_required !== undefined) {
      const priority_score = calculatePriorityScore(result.rows[0]);
      await pool.query(
        'UPDATE tasks SET priority_score = $1 WHERE id = $2',
        [priority_score, req.params.id]
      );
    }
    
    res.json({ task: result.rows[0] });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get priority explanation
router.get('/:id/priority-explanation', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = result.rows[0];
    const factors = [];
    
    if (task.deadline) {
      const daysUntilDeadline = (new Date(task.deadline) - new Date()) / (1000 * 60 * 60 * 24);
      factors.push({
        factor: 'Deadline',
        value: `${Math.ceil(daysUntilDeadline)} days`,
        impact: daysUntilDeadline < 3 ? 'high' : 'medium'
      });
    }
    
    if (task.energy_required) {
      factors.push({
        factor: 'Energy Required',
        value: `${task.energy_required}/5`,
        impact: 'medium'
      });
    }
    
    factors.push({
      factor: 'Creation Date',
      value: new Date(task.created_at).toLocaleDateString(),
      impact: 'low'
    });
    
    res.json({
      task_id: task.id,
      priority_score: task.priority_score,
      factors,
      explanation: "Priority is calculated based on urgency, energy requirements, and historical completion patterns."
    });
  } catch (error) {
    console.error('Error getting priority explanation:', error);
    res.status(500).json({ error: 'Failed to get priority explanation' });
  }
});

module.exports = router;
