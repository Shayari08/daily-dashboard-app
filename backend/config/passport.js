const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Serialize user for session
passport.serializeUser((user, done) => {
  console.log('✓ Serializing user:', user.id, user.email);
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    console.log('→ Deserializing user:', id);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows[0]) {
      console.log('✓ User found:', result.rows[0].email);
    } else {
      console.log('✗ User not found for id:', id);
    }
    done(null, result.rows[0]);
  } catch (error) {
    console.error('✗ Deserialize error:', error.message);
    done(error, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('→ Google OAuth callback received');
      console.log('→ Profile ID:', profile.id);
      console.log('→ Email:', profile.emails[0].value);
      
      // Check if user exists
      let result = await pool.query(
        'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        ['google', profile.id]
      );

      if (result.rows.length === 0) {
        console.log('→ Creating new user...');
        // Create new user
        result = await pool.query(
          `INSERT INTO users (oauth_provider, oauth_id, email, name, avatar_url) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          ['google', profile.id, profile.emails[0].value, profile.displayName, profile.photos[0]?.value]
        );
        console.log('✓ User created:', result.rows[0].id);

        // Create empty profile
        await pool.query(
          'INSERT INTO user_profiles (user_id) VALUES ($1)',
          [result.rows[0].id]
        );
        console.log('✓ User profile created');
      } else {
        console.log('✓ Existing user found:', result.rows[0].id);
        // Update last login
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [result.rows[0].id]
        );
      }

      console.log('✓ OAuth complete, returning user');
      return done(null, result.rows[0]);
    } catch (error) {
      console.error('✗ OAuth error:', error.message);
      console.error('✗ Stack:', error.stack);
      return done(error, null);
    }
  }));
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/auth/github/callback`,
    scope: ['user:email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let result = await pool.query(
        'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
        ['github', profile.id]
      );

      const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;

      if (result.rows.length === 0) {
        // Create new user
        result = await pool.query(
          `INSERT INTO users (oauth_provider, oauth_id, email, name, avatar_url) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          ['github', profile.id, email, profile.displayName || profile.username, profile.photos[0]?.value]
        );

        // Create empty profile
        await pool.query(
          'INSERT INTO user_profiles (user_id) VALUES ($1)',
          [result.rows[0].id]
        );
      } else {
        // Update last login
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [result.rows[0].id]
        );
      }

      return done(null, result.rows[0]);
    } catch (error) {
      return done(error, null);
    }
  }));
}

module.exports = passport;