const express = require('express');
const router = express.Router();
const passport = require('../config/passport');

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
  (req, res) => {
    console.log('✓ OAuth callback route reached');
    console.log('✓ User:', req.user ? req.user.email : 'No user');
    console.log('✓ Session ID:', req.sessionID);
    console.log('✓ Authenticated:', req.isAuthenticated());
    
    const redirectUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/dashboard';
    console.log('✓ Redirecting to:', redirectUrl);
    
    res.redirect(redirectUrl);
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