const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get onboarding status
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT onboarding_completed, onboarding_step, onboarding_data FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Create profile if doesn't exist
      await pool.query(
        'INSERT INTO user_profiles (user_id) VALUES ($1)',
        [req.user.id]
      );
      return res.json({ 
        completed: false, 
        step: 0,
        data: {} 
      });
    }

    const profile = result.rows[0];
    res.json({
      completed: profile.onboarding_completed || false,
      step: profile.onboarding_step || 0,
      data: profile.onboarding_data || {}
    });
  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({ error: 'Failed to get onboarding status' });
  }
});

// Update onboarding progress
router.post('/progress', isAuthenticated, async (req, res) => {
  try {
    const { step, data } = req.body;

    await pool.query(
      `INSERT INTO user_profiles (user_id, onboarding_step, onboarding_data) 
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         onboarding_step = $2,
         onboarding_data = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, step, JSON.stringify(data)]
    );

    res.json({ success: true, step, data });
  } catch (error) {
    console.error('Update onboarding error:', error);
    res.status(500).json({ error: 'Failed to update onboarding' });
  }
});

// Complete onboarding
router.post('/complete', isAuthenticated, async (req, res) => {
  try {
    const { preferences } = req.body;

    await pool.query(
      `UPDATE user_profiles 
       SET onboarding_completed = true,
           onboarding_step = 4,
           onboarding_data = $2,
           short_term_goals = $3,
           long_term_goals = $4,
           strictness_level = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [
        req.user.id,
        JSON.stringify(preferences),
        preferences.shortTermGoals || [],
        preferences.longTermGoals || [],
        preferences.strictness || 'gentle'
      ]
    );

    res.json({ success: true, message: 'Onboarding completed!' });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// Skip onboarding
router.post('/skip', isAuthenticated, async (req, res) => {
  try {
    await pool.query(
      `UPDATE user_profiles 
       SET onboarding_completed = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ success: true, message: 'Onboarding skipped' });
  } catch (error) {
    console.error('Skip onboarding error:', error);
    res.status(500).json({ error: 'Failed to skip onboarding' });
  }
});

module.exports = router;
