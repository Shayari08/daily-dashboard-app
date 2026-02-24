-- ================================================
-- RECOMMENDATIONS TABLE
-- AI-generated resource recommendations
-- ================================================

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  resource_type VARCHAR(50) NOT NULL,
  search_query VARCHAR(500),
  author_or_source VARCHAR(255),
  relevance_reason TEXT,
  reaction VARCHAR(20) DEFAULT NULL,
  added_to_tasks BOOLEAN DEFAULT FALSE,
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_batch ON recommendations(user_id, batch_id);
