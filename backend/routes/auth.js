const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    console.log('✓ OAuth callback route reached');
    console.log('✓ User:', req.user ? req.user.email : 'No user');
    console.log('✓ Session ID:', req.sessionID);
    console.log('✓ Authenticated:', req.isAuthenticated());

    try {
      // Check if user needs onboarding
      const result = await pool.query(
        'SELECT onboarding_completed FROM users WHERE id = $1',
        [req.user.id]
      );

      const needsOnboarding = !result.rows[0]?.onboarding_completed;
      const redirectPath = needsOnboarding ? '/onboarding' : '/dashboard';
      const redirectUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + redirectPath;

      console.log('✓ Onboarding needed:', needsOnboarding);
      console.log('✓ Redirecting to:', redirectUrl);

      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      // Fallback to dashboard on error
      res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/dashboard');
    }
  }
);

// GitHub OAuth routes
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000/dashboard');
  }
);

// Get current user
router.get('/me', isAuthenticated, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatar_url: req.user.avatar_url
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

module.exports = router;
module.exports.isAuthenticated = isAuthenticated;