const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = require('../config/db');

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

    let recommendationsToSave = [];

    if (generationResult.success && Array.isArray(generationResult.recommendations) && generationResult.recommendations.length > 0) {
      recommendationsToSave = generationResult.recommendations;
    } else {
      console.warn('LLM recommendations unavailable, using curated recommendation engine');
      const curatedCatalog = {
        productivity: [
          {
            title: 'Atomic Habits by James Clear',
            description: 'A proven framework for improving every day through small, compounding habit changes.',
            resource_type: 'book',
            search_query: 'Atomic Habits James Clear summary',
            author_or_source: 'James Clear',
            relevance_reason: 'Directly helps optimize your daily dashboard routines and eliminate habit friction.'
          },
          {
            title: 'Deep Work by Cal Newport',
            description: 'The ability to focus without distraction on cognitively demanding tasks.',
            resource_type: 'book',
            search_query: 'Deep Work Cal Newport key principles',
            author_or_source: 'Cal Newport',
            relevance_reason: 'Equips you with strategies to protect time blocks from interruptions.'
          },
          {
            title: 'How to Stop Procrastinating and Take Action',
            description: 'Actionable video guide breaking down the psychological triggers of task avoidance.',
            resource_type: 'video',
            search_query: 'how to stop procrastinating actionable guide',
            author_or_source: 'Ali Abdaal',
            relevance_reason: 'Practical techniques to quickly overcome task inertia on busy days.'
          }
        ],
        health: [
          {
            title: 'Huberman Lab: Master Your Sleep & Energy Protocols',
            description: 'Science-backed protocols for sunlight exposure, sleep optimization, and sustained daytime energy.',
            resource_type: 'podcast',
            search_query: 'Huberman Lab sleep energy protocol',
            author_or_source: 'Dr. Andrew Huberman',
            relevance_reason: 'Optimizing sleep is the highest-leverage lever for boosting daily stamina.'
          },
          {
            title: 'Outlive: The Science and Art of Longevity',
            description: 'A comprehensive handbook on cardiovascular health, exercise, nutritional biochemistry, and emotional health.',
            resource_type: 'book',
            search_query: 'Outlive Peter Attia summary',
            author_or_source: 'Dr. Peter Attia',
            relevance_reason: 'Translates physical fitness and nutrition goals into measurable daily actions.'
          },
          {
            title: 'Full Body Mobility & Posture Routine in 15 Minutes',
            description: 'A low-barrier physical routine to relieve stiffness from prolonged desk work.',
            resource_type: 'video',
            search_query: '15 minute desk worker mobility routine',
            author_or_source: 'Tom Merrick',
            relevance_reason: 'Easy 15-minute routine to seamlessly incorporate movement into your schedule.'
          }
        ],
        career: [
          {
            title: 'Make It Stick: The Science of Successful Learning',
            description: 'Evidence-based cognitive science techniques for effective retention and skill mastery.',
            resource_type: 'book',
            search_query: 'Make It Stick learning techniques',
            author_or_source: 'Peter C. Brown',
            relevance_reason: 'Accelerates how fast you acquire and retain skills in your learning plan.'
          },
          {
            title: 'The Pragmatic Programmer',
            description: 'Timeless principles for software engineering craft, critical thinking, and technical problem solving.',
            resource_type: 'book',
            search_query: 'The Pragmatic Programmer summary',
            author_or_source: 'David Thomas & Andrew Hunt',
            relevance_reason: 'Strengthens engineering fundamentals and day-to-day coding practices.'
          },
          {
            title: 'Learning How to Learn',
            description: 'Understand focused vs. diffuse modes of thinking and tackle complex subjects with confidence.',
            resource_type: 'course',
            search_query: 'Learning How to Learn Coursera Barbara Oakley',
            author_or_source: 'Dr. Barbara Oakley',
            relevance_reason: 'Maximizes the efficiency of your study blocks and reduces burnout.'
          }
        ],
        finance: [
          {
            title: 'The Psychology of Money',
            description: 'Timeless lessons on how behavior, ego, and emotion govern financial decisions more than spreadsheets.',
            resource_type: 'book',
            search_query: 'The Psychology of Money Morgan Housel',
            author_or_source: 'Morgan Housel',
            relevance_reason: 'Cultivates a calm, disciplined approach to budgeting, saving, and investing.'
          },
          {
            title: 'I Will Teach You to Be Rich (Automating Finances)',
            description: 'A 6-week blueprint for automated bill paying, debt elimination, and guilt-free spending.',
            resource_type: 'book',
            search_query: 'I Will Teach You To Be Rich automation system',
            author_or_source: 'Ramit Sethi',
            relevance_reason: 'Guides you to set up automatic transfers so your financial goals run on autopilot.'
          }
        ],
        relationships: [
          {
            title: 'Nonviolent Communication: A Language of Life',
            description: 'Framework for expressing feelings, hearing others deeply, and resolving conflicts with empathy.',
            resource_type: 'book',
            search_query: 'Nonviolent Communication Marshall Rosenberg',
            author_or_source: 'Marshall B. Rosenberg',
            relevance_reason: 'Elevates quality time and active listening with loved ones.'
          },
          {
            title: 'The Power of Vulnerability',
            description: 'Groundbreaking lecture on how authentic connection requires courage and openness.',
            resource_type: 'video',
            search_query: 'Brene Brown TED Power of Vulnerability',
            author_or_source: 'Brené Brown',
            relevance_reason: 'Inspires deeper, more authentic interpersonal relationships.'
          }
        ],
        creativity: [
          {
            title: 'Steal Like an Artist',
            description: 'Ten principles to unlock your creative voice, remix influences, and build creative habits.',
            resource_type: 'book',
            search_query: 'Steal Like an Artist Austin Kleon',
            author_or_source: 'Austin Kleon',
            relevance_reason: 'Removes perfectionism and jump-starts your creative brainstorming.'
          }
        ],
        mindfulness: [
          {
            title: 'Wherever You Go, There You Are',
            description: 'Warm, accessible guide to mindfulness meditation in ordinary everyday routines.',
            resource_type: 'book',
            search_query: 'Wherever You Go There You Are Jon Kabat Zinn',
            author_or_source: 'Jon Kabat-Zinn',
            relevance_reason: 'A gentle companion for starting a grounded, consistent daily meditation habit.'
          },
          {
            title: '10% Happier Podcast: Mindful Everyday Resilience',
            description: 'Interviews with meditation teachers and scientists on keeping calm amid high-stress schedules.',
            resource_type: 'podcast',
            search_query: '10 Percent Happier Podcast Dan Harris',
            author_or_source: 'Dan Harris',
            relevance_reason: 'Practical advice for staying centered while managing multiple daily priorities.'
          }
        ]
      };

      const dislikedTitles = new Set(
        (feedbackResult.rows || [])
          .filter(f => f.reaction === 'disliked')
          .map(f => (f.title || '').toLowerCase())
      );

      const targetAreas = (onboardingData.focusAreas && onboardingData.focusAreas.length > 0)
        ? onboardingData.focusAreas.map(a => a.toLowerCase())
        : ['productivity', 'career', 'health'];

      // Gather candidate items from matching areas
      const candidates = [];
      for (const area of targetAreas) {
        const key = area.includes('health') ? 'health'
          : area.includes('career') ? 'career'
          : area.includes('finan') ? 'finance'
          : area.includes('relat') ? 'relationships'
          : area.includes('creat') ? 'creativity'
          : area.includes('mind') ? 'mindfulness'
          : 'productivity';

        const list = curatedCatalog[key] || curatedCatalog.productivity;
        for (const item of list) {
          if (!dislikedTitles.has(item.title.toLowerCase()) && !candidates.some(c => c.title === item.title)) {
            candidates.push(item);
          }
        }
      }

      // Fill up to 5 recommendations with productivity/general if needed
      for (const cat of ['productivity', 'health', 'career', 'finance', 'mindfulness']) {
        if (candidates.length >= 5) break;
        for (const item of curatedCatalog[cat]) {
          if (candidates.length >= 5) break;
          if (!dislikedTitles.has(item.title.toLowerCase()) && !candidates.some(c => c.title === item.title)) {
            candidates.push(item);
          }
        }
      }

      recommendationsToSave = candidates.slice(0, 5);
    }

    // Generate shared batch_id
    const batchIdResult = await client.query('SELECT gen_random_uuid() as batch_id');
    const batchId = batchIdResult.rows[0].batch_id;

    // Insert recommendations
    const inserted = [];
    for (const rec of recommendationsToSave) {
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
