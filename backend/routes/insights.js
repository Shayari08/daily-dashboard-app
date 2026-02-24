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
       WHERE hl.habit_id IN (SELECT id FROM habits WHERE user_id = $1)
       AND hl.date BETWEEN $2 AND $3
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

// Get behavioral insights
router.get('/behavioral', isAuthenticated, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const userId = req.user.id;

    // 1. Productivity Trends
    const productivityResult = await pool.query(
      `SELECT
         DATE(completed_at) as date,
         COUNT(*) as count
       FROM tasks
       WHERE user_id = $1
         AND status = 'completed'
         AND completed_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`,
      [userId, days]
    );

    const avgTasksPerDay = productivityResult.rows.length > 0
      ? (productivityResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0) / days).toFixed(1)
      : 0;

    // Calculate trend (comparing first half vs second half)
    const midpoint = Math.floor(productivityResult.rows.length / 2);
    const firstHalf = productivityResult.rows.slice(0, midpoint);
    const secondHalf = productivityResult.rows.slice(midpoint);

    const firstHalfAvg = firstHalf.length > 0
      ? firstHalf.reduce((sum, row) => sum + parseInt(row.count), 0) / firstHalf.length
      : 0;
    const secondHalfAvg = secondHalf.length > 0
      ? secondHalf.reduce((sum, row) => sum + parseInt(row.count), 0) / secondHalf.length
      : 0;

    let trendDirection = 'stable';
    if (secondHalfAvg > firstHalfAvg * 1.1) trendDirection = 'improving';
    else if (secondHalfAvg < firstHalfAvg * 0.9) trendDirection = 'declining';

    // 2. Time-of-Day Patterns
    const timePattern = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM completed_at) as hour,
         COUNT(*) as count
       FROM tasks
       WHERE user_id = $1
         AND status = 'completed'
         AND completed_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY hour
       ORDER BY count DESC
       LIMIT 1`,
      [userId, days]
    );

    const peakHour = timePattern.rows.length > 0 ? parseInt(timePattern.rows[0].hour) : null;
    let peakSummary = 'Not enough data';
    if (peakHour !== null) {
      if (peakHour >= 5 && peakHour < 12) peakSummary = 'Morning person (5am-12pm)';
      else if (peakHour >= 12 && peakHour < 17) peakSummary = 'Afternoon person (12pm-5pm)';
      else if (peakHour >= 17 && peakHour < 22) peakSummary = 'Evening person (5pm-10pm)';
      else peakSummary = 'Night owl (10pm-5am)';
    }

    // Get hourly distribution for chart
    const hourlyDistribution = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM completed_at) as hour,
         COUNT(*) as count
       FROM tasks
       WHERE user_id = $1
         AND status = 'completed'
         AND completed_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY hour
       ORDER BY hour ASC`,
      [userId, days]
    );

    // 3. Procrastination Analysis
    const procrastinationResult = await pool.query(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) as avg_hours,
         COUNT(CASE WHEN completed_at - created_at > INTERVAL '1 day' THEN 1 END) as delayed_count,
         COUNT(*) as total_count
       FROM tasks
       WHERE user_id = $1
         AND status = 'completed'
         AND completed_at IS NOT NULL
         AND created_at IS NOT NULL
         AND completed_at > NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );

    const avgHours = procrastinationResult.rows[0].avg_hours
      ? parseFloat(procrastinationResult.rows[0].avg_hours).toFixed(1)
      : 0;
    const delayedPercent = procrastinationResult.rows[0].total_count > 0
      ? ((procrastinationResult.rows[0].delayed_count / procrastinationResult.rows[0].total_count) * 100).toFixed(1)
      : 0;

    let procrastinationSummary = 'Great! You complete tasks promptly.';
    if (avgHours > 48) procrastinationSummary = 'Tasks take a while. Try breaking them into smaller steps.';
    else if (avgHours > 24) procrastinationSummary = 'Some tasks sit for a day+. Consider prioritizing better.';

    // 4. Habit Consistency
    const habitsResult = await pool.query(
      `SELECT
         h.name,
         h.streak,
         h.frequency,
         COUNT(hl.id) as logs_count
       FROM habits h
       LEFT JOIN habit_logs hl ON h.id = hl.habit_id
         AND hl.date > NOW() - INTERVAL '1 day' * $2
       WHERE h.user_id = $1
         AND h.archived_at IS NULL
       GROUP BY h.id, h.name, h.streak, h.frequency
       ORDER BY h.streak DESC`,
      [userId, days]
    );

    const avgStreak = habitsResult.rows.length > 0
      ? (habitsResult.rows.reduce((sum, h) => sum + h.streak, 0) / habitsResult.rows.length).toFixed(1)
      : 0;

    res.json({
      success: true,
      insights: {
        productivityTrends: {
          avgTasksPerDay: parseFloat(avgTasksPerDay),
          trend: trendDirection,
          dailyData: productivityResult.rows
        },
        timeOfDay: {
          peakHour,
          summary: peakSummary,
          hourlyDistribution: hourlyDistribution.rows
        },
        procrastination: {
          avgHours: parseFloat(avgHours),
          delayedPercent: parseFloat(delayedPercent),
          summary: procrastinationSummary
        },
        habitConsistency: {
          avgStreak: parseFloat(avgStreak),
          habits: habitsResult.rows
        }
      }
    });
  } catch (error) {
    console.error('Error fetching behavioral insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

module.exports = router;
