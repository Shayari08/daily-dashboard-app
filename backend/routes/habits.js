const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all habits for user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = 'SELECT * FROM habits WHERE user_id = $1';
    const params = [req.user.id];
    
    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ habits: result.rows });
  } catch (error) {
    console.error('Error fetching habits:', error);
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

// Get habit with logs
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const habitResult = await pool.query(
      'SELECT * FROM habits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (habitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    const logsResult = await pool.query(
      `SELECT * FROM habit_logs 
       WHERE habit_id = $1 
       ORDER BY log_date DESC 
       LIMIT 30`,
      [req.params.id]
    );
    
    res.json({
      habit: habitResult.rows[0],
      logs: logsResult.rows
    });
  } catch (error) {
    console.error('Error fetching habit:', error);
    res.status(500).json({ error: 'Failed to fetch habit' });
  }
});

// Detect habits from behavior
router.post('/detect', isAuthenticated, async (req, res) => {
  try {
    // Get completed tasks in last 30 days
    const tasksResult = await pool.query(
      `SELECT title, completed_at::date as date, COUNT(*) as count
       FROM tasks
       WHERE user_id = $1 
       AND status = 'completed'
       AND completed_at > CURRENT_DATE - INTERVAL '30 days'
       GROUP BY title, completed_at::date
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC`,
      [req.user.id]
    );
    
    const potentialHabits = [];
    
    // Group by task title
    const taskGroups = {};
    tasksResult.rows.forEach(row => {
      if (!taskGroups[row.title]) {
        taskGroups[row.title] = [];
      }
      taskGroups[row.title].push({ date: row.date, count: row.count });
    });
    
    // Analyze each task group
    for (const [taskName, actions] of Object.entries(taskGroups)) {
      if (actions.length >= 3) {
        // Check if habit already exists
        const existingHabit = await pool.query(
          'SELECT id FROM habits WHERE user_id = $1 AND name = $2',
          [req.user.id, taskName]
        );
        
        if (existingHabit.rows.length === 0) {
          const analysis = await llmService.detectHabitPattern(actions, taskName);
          
          if (analysis.success && analysis.analysis.is_habit) {
            potentialHabits.push({
              name: analysis.analysis.suggested_name || taskName,
              frequency: analysis.analysis.frequency,
              evidence: analysis.analysis.evidence,
              actions_count: actions.length
            });
          }
        }
      }
    }
    
    res.json({ potential_habits: potentialHabits });
  } catch (error) {
    console.error('Error detecting habits:', error);
    res.status(500).json({ error: 'Failed to detect habits' });
  }
});

// Create habit suggestion
router.post('/suggest', isAuthenticated, async (req, res) => {
  try {
    const { name, description, frequency, evidence, ai_reasoning } = req.body;
    
    const result = await pool.query(
      `INSERT INTO habits 
       (user_id, name, description, frequency, status, detection_evidence, ai_reasoning) 
       VALUES ($1, $2, $3, $4, 'suggested', $5, $6) 
       RETURNING *`,
      [req.user.id, name, description, frequency, evidence, ai_reasoning]
    );
    
    res.status(201).json({ habit: result.rows[0] });
  } catch (error) {
    console.error('Error creating habit suggestion:', error);
    res.status(500).json({ error: 'Failed to create habit suggestion' });
  }
});

// Accept or decline habit suggestion
router.post('/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const { accept } = req.body;
    
    if (accept) {
      const result = await pool.query(
        `UPDATE habits 
         SET status = 'active', accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [req.params.id, req.user.id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Habit not found' });
      }
      
      res.json({ habit: result.rows[0], message: 'Habit accepted' });
    } else {
      // Delete declined suggestion
      await pool.query(
        'DELETE FROM habits WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      
      res.json({ message: 'Habit suggestion declined' });
    }
  } catch (error) {
    console.error('Error responding to habit:', error);
    res.status(500).json({ error: 'Failed to respond to habit' });
  }
});

// Create habit manually
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { name, description, frequency } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO habits 
       (user_id, name, description, frequency, status) 
       VALUES ($1, $2, $3, $4, 'active') 
       RETURNING *`,
      [req.user.id, name, description, frequency || 'daily']
    );
    
    res.status(201).json({ habit: result.rows[0] });
  } catch (error) {
    console.error('Error creating habit:', error);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// Log habit completion
router.post('/:id/log', isAuthenticated, async (req, res) => {
  try {
    const { completed = true, log_date, notes } = req.body;
    const date = log_date || new Date().toISOString().split('T')[0];
    
    // Check if log already exists for this date
    const existingLog = await pool.query(
      'SELECT id FROM habit_logs WHERE habit_id = $1 AND log_date = $2',
      [req.params.id, date]
    );
    
    if (existingLog.rows.length > 0) {
      // Update existing log
      const result = await pool.query(
        `UPDATE habit_logs 
         SET completed = $1, notes = $2 
         WHERE id = $3 
         RETURNING *`,
        [completed, notes, existingLog.rows[0].id]
      );
      
      return res.json({ log: result.rows[0], message: 'Log updated' });
    }
    
    // Create new log
    const result = await pool.query(
      `INSERT INTO habit_logs 
       (habit_id, user_id, completed, log_date, notes) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.params.id, req.user.id, completed, date, notes]
    );
    
    res.status(201).json({ log: result.rows[0] });
  } catch (error) {
    console.error('Error logging habit:', error);
    res.status(500).json({ error: 'Failed to log habit' });
  }
});

// Get habit streak
router.get('/:id/streak', isAuthenticated, async (req, res) => {
  try {
    const logsResult = await pool.query(
      `SELECT log_date, completed 
       FROM habit_logs 
       WHERE habit_id = $1 AND completed = true
       ORDER BY log_date DESC`,
      [req.params.id]
    );
    
    if (logsResult.rows.length === 0) {
      return res.json({ current_streak: 0, longest_streak: 0 });
    }
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;
    
    logsResult.rows.forEach((log, index) => {
      const logDate = new Date(log.log_date);
      
      if (index === 0) {
        // Check if most recent log is today or yesterday
        const today = new Date();
        const diffDays = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
          currentStreak = 1;
          tempStreak = 1;
        }
      } else {
        const daysDiff = Math.floor((lastDate - logDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          tempStreak++;
          if (index === 1) currentStreak++;
        } else {
          if (tempStreak > longestStreak) longestStreak = tempStreak;
          tempStreak = 1;
        }
      }
      
      lastDate = logDate;
    });
    
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    
    res.json({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      total_completions: logsResult.rows.length
    });
  } catch (error) {
    console.error('Error calculating streak:', error);
    res.status(500).json({ error: 'Failed to calculate streak' });
  }
});

// Update habit
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, description, frequency, status } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (frequency !== undefined) {
      updates.push(`frequency = $${paramCount++}`);
      values.push(frequency);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id, req.user.id);
    
    const result = await pool.query(
      `UPDATE habits SET ${updates.join(', ')} 
       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    res.json({ habit: result.rows[0] });
  } catch (error) {
    console.error('Error updating habit:', error);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// Delete habit
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM habits WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    res.json({ message: 'Habit deleted successfully' });
  } catch (error) {
    console.error('Error deleting habit:', error);
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

module.exports = router;
