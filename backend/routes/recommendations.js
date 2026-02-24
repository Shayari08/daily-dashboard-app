const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ================================================
// GET /api/recommendations - Fetch latest batch
// ================================================
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get most recent batch_id
    const batchResult = await pool.query(
      `SELECT batch_id FROM recommendations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (batchResult.rows.length === 0) {
      return res.json({ recommendations: [] });
    }

    const batchId = batchResult.rows[0].batch_id;

    const result = await pool.query(
      `SELECT * FROM recommendations
       WHERE user_id = $1 AND batch_id = $2
       ORDER BY created_at ASC`,
      [req.user.id, batchId]
    );

    res.json({ recommendations: result.rows });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ================================================
// POST /api/recommendations/generate - Generate new batch
// ================================================
router.post('/generate', isAuthenticated, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch user onboarding data
    const userResult = await client.query(
      'SELECT onboarding_data FROM users WHERE id = $1',
      [req.user.id]
    );
    const onboardingData = userResult.rows[0]?.onboarding_data || {};

    // Fetch active recurring goals
    const goalsResult = await client.query(
      `SELECT title, frequency, times_per_week, category FROM recurring_goals
       WHERE user_id = $1 AND is_active = true`,
      [req.user.id]
    );

    // Fetch current pending tasks
    const tasksResult = await client.query(
      `SELECT title, category FROM tasks
       WHERE user_id = $1 AND status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    );

    // Fetch past liked/disliked recommendations for feedback
    const feedbackResult = await client.query(
      `SELECT title, resource_type, reaction, relevance_reason FROM recommendations
       WHERE user_id = $1 AND reaction IS NOT NULL
       ORDER BY updated_at DESC LIMIT 20`,
      [req.user.id]
    );

    // Generate via LLM
    const generationResult = await llmService.generateRecommendations({
      goalsText: onboardingData.goalsText || '',
      focusAreas: onboardingData.focusAreas || [],
      workStyle: onboardingData.workStyle || onboardingData.preferences?.workStyle || 'balanced',
      recurringGoals: goalsResult.rows,
      currentTasks: tasksResult.rows,
      pastFeedback: feedbackResult.rows
    });

    if (!generationResult.success || !generationResult.recommendations) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        details: generationResult.error
      });
    }

    // Generate shared batch_id
    const batchIdResult = await client.query('SELECT gen_random_uuid() as batch_id');
    const batchId = batchIdResult.rows[0].batch_id;

    // Insert recommendations
    const inserted = [];
    for (const rec of generationResult.recommendations) {
      const result = await client.query(
        `INSERT INTO recommendations
         (user_id, title, description, resource_type, search_query,
          author_or_source, relevance_reason, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.user.id,
          rec.title,
          rec.description || null,
          rec.resource_type || 'article',
          rec.search_query || rec.title,
          rec.author_or_source || null,
          rec.relevance_reason || null,
          batchId
        ]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      count: inserted.length,
      recommendations: inserted
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Recommendation generation error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  } finally {
    client.release();
  }
});

// ================================================
// POST /api/recommendations/:id/react - Like or dislike
// ================================================
router.post('/:id/react', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction } = req.body;

    if (reaction && !['liked', 'disliked'].includes(reaction)) {
      return res.status(400).json({ error: 'Reaction must be "liked", "disliked", or null' });
    }

    const result = await pool.query(
      `UPDATE recommendations
       SET reaction = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [reaction || null, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    res.json({ success: true, recommendation: result.rows[0] });
  } catch (error) {
    console.error('React to recommendation error:', error);
    res.status(500).json({ error: 'Failed to save reaction' });
  }
});

// ================================================
// POST /api/recommendations/:id/add-to-tasks - Create task from rec
// ================================================
router.post('/:id/add-to-tasks', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const recResult = await pool.query(
      'SELECT * FROM recommendations WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (recResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    const rec = recResult.rows[0];

    // Create task from recommendation
    const taskResult = await pool.query(
      `INSERT INTO tasks
       (user_id, title, description, status, created_by)
       VALUES ($1, $2, $3, 'pending', 'ai')
       RETURNING *`,
      [
        req.user.id,
        rec.title,
        `${rec.description || ''}\n\nSearch: ${rec.search_query || rec.title}`.trim()
      ]
    );

    // Mark as added
    await pool.query(
      `UPDATE recommendations SET added_to_tasks = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true, task: taskResult.rows[0] });
  } catch (error) {
    console.error('Add recommendation to tasks error:', error);
    res.status(500).json({ error: 'Failed to add recommendation to tasks' });
  }
});

module.exports = router;
