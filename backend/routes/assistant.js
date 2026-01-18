const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Conversational assistant endpoint
router.post('/query', isAuthenticated, async (req, res) => {
  try {
    const { question, context } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Gather relevant context
    const userContext = {
      user_id: req.user.id,
      ...context
    };
    
    // Get recent tasks if needed
    if (question.toLowerCase().includes('task')) {
      const tasksResult = await pool.query(
        'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
        [req.user.id]
      );
      userContext.recent_tasks = tasksResult.rows;
    }
    
    // Get profile if needed
    if (question.toLowerCase().includes('goal') || question.toLowerCase().includes('preference')) {
      const profileResult = await pool.query(
        'SELECT * FROM user_profiles WHERE user_id = $1',
        [req.user.id]
      );
      userContext.profile = profileResult.rows[0];
    }
    
    const response = await llmService.answerQuestion(question, userContext);
    
    if (!response.success) {
      return res.status(500).json({ 
        error: 'Failed to process question',
        fallback: response.fallback 
      });
    }
    
    res.json({ 
      answer: response.text,
      sources: userContext
    });
  } catch (error) {
    console.error('Error processing assistant query:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Check LLM health
router.get('/health', isAuthenticated, async (req, res) => {
  try {
    const health = await llmService.checkHealth();
    res.json(health);
  } catch (error) {
    console.error('Error checking LLM health:', error);
    res.status(500).json({ error: 'Failed to check LLM health' });
  }
});

module.exports = router;
