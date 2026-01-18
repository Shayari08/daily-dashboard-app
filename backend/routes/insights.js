const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all insights
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { type, limit = 10 } = req.query;
    
    let query = 'SELECT * FROM insights WHERE user_id = $1';
    const params = [req.user.id];
    
    if (type) {
      query += ' AND insight_type = $2';
      params.push(type);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)}`;
    
    const result = await pool.query(query, params);
    res.json({ insights: result.rows });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// Generate daily review
router.post('/daily-review', isAuthenticated, async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().split('T')[0];
    
    // Get completed tasks
    const completedResult = await pool.query(
      `SELECT * FROM tasks 
       WHERE user_id = $1 
       AND status = 'completed' 
       AND DATE(completed_at) = $2`,
      [req.user.id, date]
    );
    
    // Get skipped tasks
    const skippedResult = await pool.query(
      `SELECT t.* FROM tasks t
       JOIN behavioral_logs bl ON t.id = bl.task_id
       WHERE t.user_id = $1 
       AND bl.action_type = 'task_skipped'
       AND DATE(bl.timestamp) = $2`,
      [req.user.id, date]
    );
    
    // Get daily state
    const stateResult = await pool.query(
      'SELECT * FROM daily_states WHERE user_id = $1 AND state_date = $2',
      [req.user.id, date]
    );
    
    const behaviorData = {
      date,
      completed_tasks: completedResult.rows,
      skipped_tasks: skippedResult.rows,
      daily_state: stateResult.rows[0] || null,
      completion_rate: completedResult.rows.length / (completedResult.rows.length + skippedResult.rows.length) || 0
    };
    
    const response = await llmService.generateInsight(behaviorData, 'daily');
    
    if (!response.success) {
      return res.status(500).json({ error: 'Failed to generate daily review' });
    }
    
    // Save insight
    const insertResult = await pool.query(
      `INSERT INTO insights 
       (user_id, insight_type, title, content, observed_data, confidence_level) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        req.user.id,
        'daily',
        response.insight.title,
        response.insight.content,
        JSON.stringify(behaviorData),
        response.insight.confidence
      ]
    );
    
    res.json({ 
      insight: insertResult.rows[0],
      suggestion: response.insight.suggestion
    });
  } catch (error) {
    console.error('Error generating daily review:', error);
    res.status(500).json({ error: 'Failed to generate daily review' });
  }
});

// Generate weekly review
router.post('/weekly-review', isAuthenticated, async (req, res) => {
  try {
    const endDate = req.body.end_date || new Date().toISOString().split('T')[0];
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
    
    // Get completed tasks
    const completedResult = await pool.query(
      `SELECT * FROM tasks 
       WHERE user_id = $1 
       AND status = 'completed' 
       AND completed_at BETWEEN $2 AND $3`,
      [req.user.id, startDate.toISOString(), endDate]
    );
    
    // Get all tasks created in period
    const allTasksResult = await pool.query(
      `SELECT * FROM tasks 
       WHERE user_id = $1 
       AND created_at BETWEEN $2 AND $3`,
      [req.user.id, startDate.toISOString(), endDate]
    );
    
    // Get energy patterns
    const statesResult = await pool.query(
      `SELECT * FROM daily_states 
       WHERE user_id = $1 
       AND state_date BETWEEN $2 AND $3
       ORDER BY state_date`,
      [req.user.id, startDate.toISOString().split('T')[0], endDate]
    );
    
    // Get habit logs
    const habitLogsResult = await pool.query(
      `SELECT h.name, hl.* FROM habit_logs hl
       JOIN habits h ON hl.habit_id = h.id
       WHERE hl.user_id = $1 
       AND hl.log_date BETWEEN $2 AND $3
       AND hl.completed = true`,
      [req.user.id, startDate.toISOString().split('T')[0], endDate]
    );
    
    const behaviorData = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate
      },
      completed_tasks: completedResult.rows.length,
      total_tasks: allTasksResult.rows.length,
      completion_rate: completedResult.rows.length / allTasksResult.rows.length || 0,
      energy_states: statesResult.rows,
      habit_completions: habitLogsResult.rows.length,
      habits: habitLogsResult.rows
    };
    
    const response = await llmService.generateInsight(behaviorData, 'weekly');
    
    if (!response.success) {
      return res.status(500).json({ error: 'Failed to generate weekly review' });
    }
    
    // Save insight
    const insertResult = await pool.query(
      `INSERT INTO insights 
       (user_id, insight_type, title, content, observed_data, confidence_level) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        req.user.id,
        'weekly',
        response.insight.title,
        response.insight.content,
        JSON.stringify(behaviorData),
        response.insight.confidence
      ]
    );
    
    res.json({ 
      insight: insertResult.rows[0],
      suggestion: response.insight.suggestion,
      stats: {
        completion_rate: (behaviorData.completion_rate * 100).toFixed(1) + '%',
        tasks_completed: behaviorData.completed_tasks,
        habits_maintained: behaviorData.habit_completions
      }
    });
  } catch (error) {
    console.error('Error generating weekly review:', error);
    res.status(500).json({ error: 'Failed to generate weekly review' });
  }
});

module.exports = router;
