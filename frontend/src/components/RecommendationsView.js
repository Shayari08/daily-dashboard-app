import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Recommendations.css';

function RecommendationsView({ onTaskAdded }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const response = await axios.get('/api/recommendations', {
        withCredentials: true
      });
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await axios.post('/api/recommendations/generate', {}, {
        withCredentials: true
      });
      if (response.data.success) {
        setRecommendations(response.data.recommendations);
      }
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
      alert('Failed to generate recommendations. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleReact = async (id, reaction) => {
    try {
      const current = recommendations.find(r => r.id === id);
      const newReaction = current?.reaction === reaction ? null : reaction;

      await axios.post(`/api/recommendations/${id}/react`, {
        reaction: newReaction
      }, { withCredentials: true });

      setRecommendations(prev =>
        prev.map(r => r.id === id ? { ...r, reaction: newReaction } : r)
      );
    } catch (error) {
      console.error('Failed to react:', error);
    }
  };

  const handleAddToTasks = async (id) => {
    try {
      const response = await axios.post(`/api/recommendations/${id}/add-to-tasks`, {}, {
        withCredentials: true
      });
      if (response.data.success) {
        setRecommendations(prev => prev.filter(r => r.id !== id));
        if (onTaskAdded) onTaskAdded();
      }
    } catch (error) {
      console.error('Failed to add to tasks:', error);
      alert('Failed to add to tasks.');
    }
  };

  const getSearchUrl = (rec) => {
    const query = encodeURIComponent(rec.search_query || rec.title);
    if (rec.resource_type === 'video') {
      return `https://www.youtube.com/results?search_query=${query}`;
    }
    if (rec.resource_type === 'paper') {
      return `https://scholar.google.com/scholar?q=${query}`;
    }
    return `https://www.google.com/search?q=${query}`;
  };

  const getTypeIcon = (type) => {
    const icons = {
      video: '🎬',
      article: '📰',
      paper: '🔬',
      book: '📚',
      podcast: '🎧',
      course: '🎓'
    };
    return icons[type] || '📄';
  };

  const getTypeLabel = (type) => {
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Resource';
  };

  if (loading) {
    return (
      <div className="recommendations-loading">
        <div className="loading-spinner"></div>
        <p>Loading recommendations...</p>
      </div>
    );
  }

  return (
    <div className="recommendations-view">
      {recommendations.length > 0 && (
        <div className="recommendations-header">
          <button
            className="btn-regenerate"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Generating...' : '✨ Generate New'}
          </button>
        </div>
      )}

      {recommendations.length === 0 ? (
        <div className="recommendations-empty">
          <div className="empty-icon-recs">📖</div>
          <p>No recommendations yet!</p>
          <span>Generate personalized resource recommendations based on your goals.</span>
          <button
            className="btn-generate-first"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Generating...' : '✨ Get My Recommendations'}
          </button>
        </div>
      ) : (
        <>
          <div className="recommendations-grid">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`recommendation-card ${rec.reaction === 'liked' ? 'liked' : ''} ${rec.reaction === 'disliked' ? 'disliked' : ''}`}
              >
                <div className="rec-type-badge">
                  <span className="rec-type-icon">{getTypeIcon(rec.resource_type)}</span>
                  <span className="rec-type-label">{getTypeLabel(rec.resource_type)}</span>
                </div>

                <h4 className="rec-title">{rec.title}</h4>
                {rec.author_or_source && (
                  <div className="rec-source">by {rec.author_or_source}</div>
                )}
                <p className="rec-description">{rec.description}</p>
                {rec.relevance_reason && (
                  <div className="rec-relevance">
                    <span className="relevance-icon">🎯</span>
                    {rec.relevance_reason}
                  </div>
                )}

                <div className="rec-actions">
                  <a
                    href={getSearchUrl(rec)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-search-link"
                  >
                    🔍 Find Resource
                  </a>

                  <div className="rec-reaction-buttons">
                    <button
                      className={`btn-react btn-like ${rec.reaction === 'liked' ? 'active' : ''}`}
                      onClick={() => handleReact(rec.id, 'liked')}
                      title="Like this recommendation"
                    >
                      👍
                    </button>
                    <button
                      className={`btn-react btn-dislike ${rec.reaction === 'disliked' ? 'active' : ''}`}
                      onClick={() => handleReact(rec.id, 'disliked')}
                      title="Dislike this recommendation"
                    >
                      👎
                    </button>
                  </div>

                  <button
                    className={`btn-add-to-tasks ${rec.added_to_tasks ? 'added' : ''}`}
                    onClick={() => handleAddToTasks(rec.id)}
                    disabled={rec.added_to_tasks}
                    title={rec.added_to_tasks ? 'Already added to tasks' : 'Add to your task list'}
                  >
                    {rec.added_to_tasks ? '✓ Added' : '+ Add to Tasks'}
                  </button>
                </div>
              </div>
            ))}
          </div>

        </>
      )}
    </div>
  );
}

export default RecommendationsView;
