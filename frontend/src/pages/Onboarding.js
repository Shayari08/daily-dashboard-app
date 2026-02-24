import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/Onboarding.css';

function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    goalsText: '',
    focusAreas: [],
    dailyRoutine: {
      morningRoutine: false,
      eveningRoutine: false,
      exerciseFrequency: 'daily'
    },
    preferences: {
      workStyle: 'balanced',
      mindfulness: false
    },
    specificMetrics: {
      targetExerciseDays: 3,
      targetLearningMinutes: 30,
      targetSleepHours: 8
    }
  });

  // AI-generated preview
  const [aiPreview, setAiPreview] = useState({
    tasks: [],
    habits: [],
    analysis: null
  });

  const totalSteps = 4;

  // Check if user already completed onboarding
  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const response = await axios.get('/api/onboarding/status', { withCredentials: true });
      if (!response.data.needsOnboarding) {
        // Already completed, redirect to dashboard
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    }
  };

  const focusAreaOptions = [
    { id: 'health', label: 'Health & Fitness', icon: '🏃', color: '#7A9B76' },
    { id: 'career', label: 'Career & Learning', icon: '📚', color: '#E8B86D' },
    { id: 'productivity', label: 'Productivity', icon: '🎯', color: '#D97757' },
    { id: 'relationships', label: 'Relationships', icon: '❤️', color: '#C96847' },
    { id: 'creativity', label: 'Creativity', icon: '🎨', color: '#9B9690' },
    { id: 'finance', label: 'Finance', icon: '💰', color: '#6B9462' },
    { id: 'mindfulness', label: 'Mindfulness', icon: '🧘', color: '#FAF8F5' }
  ];

  const handleFocusAreaToggle = (areaId) => {
    setFormData(prev => ({
      ...prev,
      focusAreas: prev.focusAreas.includes(areaId)
        ? prev.focusAreas.filter(id => id !== areaId)
        : [...prev.focusAreas, areaId]
    }));
  };

  const handleNext = async () => {
    if (currentStep === 3) {
      // Generate AI preview before step 4
      await generateAIPreview();
    }
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSkip = async () => {
    if (window.confirm('Skip onboarding? You can reset goals from the dashboard to redo this later.')) {
      try {
        // Mark onboarding as completed without generating tasks/habits
        await axios.post('/api/onboarding/complete', {
          skipped: true
        }, { withCredentials: true });
        navigate('/dashboard');
      } catch (error) {
        console.error('Error skipping onboarding:', error);
        navigate('/dashboard'); // Go to dashboard anyway
      }
    }
  };

  const generateAIPreview = async () => {
    setAiGenerating(true);
    setGenerationProgress(0);
    setError(null);

    // Simulate progress bar
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 500);

    try {
      console.log('Sending preview request with data:', {
        goalsText: formData.goalsText.substring(0, 50) + '...',
        focusAreas: formData.focusAreas,
        dailyRoutine: formData.dailyRoutine,
        preferences: formData.preferences
      });

      const response = await axios.post('/api/onboarding/preview', {
        goalsText: formData.goalsText,
        focusAreas: formData.focusAreas,
        dailyRoutine: formData.dailyRoutine,
        preferences: formData.preferences
      }, { withCredentials: true });

      console.log('Preview response:', response.data);

      if (response.data.success) {
        setGenerationProgress(100);
        setAiPreview(response.data.preview);

        console.log('✓ Tasks generated:', response.data.preview.tasks.length);
        console.log('✓ Habits generated:', response.data.preview.habits.length);
      } else {
        setError('Failed to generate AI suggestions. Please try again.');
        console.error('Preview failed:', response.data);
      }
    } catch (error) {
      console.error('Error generating AI preview:', error);
      console.error('Error details:', error.response?.data);
      setError('AI service unavailable. You can still complete onboarding with basic suggestions.');
    } finally {
      clearInterval(progressInterval);
      setAiGenerating(false);
      setGenerationProgress(100);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/onboarding/complete', {
        name: formData.name,
        goalsText: formData.goalsText,
        focusAreas: formData.focusAreas,
        dailyRoutine: formData.dailyRoutine,
        preferences: formData.preferences,
        specificMetrics: formData.specificMetrics
      }, { withCredentials: true });

      if (response.data.success) {
        // Show success message
        alert(`Welcome! Created ${response.data.tasksCreated} tasks and ${response.data.habitsCreated} habits for you.`);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setError('Failed to save your preferences. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="onboarding-step">
            <div className="step-icon">👋</div>
            <h2 className="step-title">Welcome! Let's get to know you</h2>
            <p className="step-description">
              Share your goals and aspirations. What do you want to achieve?
            </p>

            <div className="form-group">
              <label className="form-label">What should we call you?</label>
              <input
                type="text"
                className="form-input-onboarding"
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Tell us about your goals and what you want to work on
              </label>
              <textarea
                className="form-textarea-onboarding"
                placeholder="For example: I want to get healthier by exercising more, learn web development, and spend more quality time with family. I often feel overwhelmed and want to be more organized..."
                rows="8"
                value={formData.goalsText}
                onChange={(e) => setFormData({ ...formData, goalsText: e.target.value })}
              />
              <div className="character-count">
                {formData.goalsText.length} characters (minimum 20)
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="onboarding-step">
            <div className="step-icon">🎯</div>
            <h2 className="step-title">What areas do you want to focus on?</h2>
            <p className="step-description">
              Select all that apply. We'll personalize your experience.
            </p>

            <div className="focus-areas-grid">
              {focusAreaOptions.map(area => (
                <button
                  key={area.id}
                  className={`focus-area-card ${formData.focusAreas.includes(area.id) ? 'selected' : ''}`}
                  onClick={() => handleFocusAreaToggle(area.id)}
                  style={{
                    '--area-color': area.color
                  }}
                >
                  <div className="focus-area-icon">{area.icon}</div>
                  <div className="focus-area-label">{area.label}</div>
                  {formData.focusAreas.includes(area.id) && (
                    <div className="focus-area-checkmark">✓</div>
                  )}
                </button>
              ))}
            </div>

            {formData.focusAreas.length === 0 && (
              <p className="hint-text">Please select at least one focus area</p>
            )}
          </div>
        );

      case 3:
        return (
          <div className="onboarding-step">
            <div className="step-icon">⏰</div>
            <h2 className="step-title">Tell us about your daily routine</h2>
            <p className="step-description">
              This helps us suggest the right habits and tasks for you.
            </p>

            <div className="form-section">
              <h3 className="section-title">Routine Preferences</h3>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.dailyRoutine.morningRoutine}
                  onChange={(e) => setFormData({
                    ...formData,
                    dailyRoutine: { ...formData.dailyRoutine, morningRoutine: e.target.checked }
                  })}
                />
                <span>I want to build a morning routine 🌅</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.dailyRoutine.eveningRoutine}
                  onChange={(e) => setFormData({
                    ...formData,
                    dailyRoutine: { ...formData.dailyRoutine, eveningRoutine: e.target.checked }
                  })}
                />
                <span>I want to build an evening routine 🌙</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.preferences.mindfulness}
                  onChange={(e) => setFormData({
                    ...formData,
                    preferences: { ...formData.preferences, mindfulness: e.target.checked }
                  })}
                />
                <span>I'm interested in mindfulness/meditation 🧘</span>
              </label>
            </div>

            <div className="form-section">
              <h3 className="section-title">Work Style</h3>
              <div className="radio-group">
                {['focused', 'balanced', 'flexible'].map(style => (
                  <label key={style} className="radio-label">
                    <input
                      type="radio"
                      name="workStyle"
                      value={style}
                      checked={formData.preferences.workStyle === style}
                      onChange={(e) => setFormData({
                        ...formData,
                        preferences: { ...formData.preferences, workStyle: e.target.value }
                      })}
                    />
                    <span className="radio-text">
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Specific Targets (Optional)</h3>

              <div className="metric-input-group">
                <label className="metric-label">Exercise days per week</label>
                <input
                  type="number"
                  min="0"
                  max="7"
                  className="metric-input"
                  value={formData.specificMetrics.targetExerciseDays}
                  onChange={(e) => setFormData({
                    ...formData,
                    specificMetrics: { ...formData.specificMetrics, targetExerciseDays: parseInt(e.target.value) }
                  })}
                />
              </div>

              <div className="metric-input-group">
                <label className="metric-label">Learning minutes per day</label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="5"
                  className="metric-input"
                  value={formData.specificMetrics.targetLearningMinutes}
                  onChange={(e) => setFormData({
                    ...formData,
                    specificMetrics: { ...formData.specificMetrics, targetLearningMinutes: parseInt(e.target.value) }
                  })}
                />
              </div>

              <div className="metric-input-group">
                <label className="metric-label">Target sleep hours</label>
                <input
                  type="number"
                  min="4"
                  max="12"
                  step="0.5"
                  className="metric-input"
                  value={formData.specificMetrics.targetSleepHours}
                  onChange={(e) => setFormData({
                    ...formData,
                    specificMetrics: { ...formData.specificMetrics, targetSleepHours: parseFloat(e.target.value) }
                  })}
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="onboarding-step">
            <div className="step-icon">✨</div>
            <h2 className="step-title">Your Personalized Plan</h2>
            <p className="step-description">
              {aiGenerating
                ? 'Our AI is creating your personalized tasks and habits...'
                : 'Review your AI-generated plan below. You can edit these later!'}
            </p>

            {aiGenerating && (
              <div className="ai-loading">
                <div className="loading-spinner"></div>
                <p>Analyzing your goals and generating recommendations...</p>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="loading-subtext">{generationProgress}% complete</p>
              </div>
            )}

            {!aiGenerating && aiPreview.analysis && (
              <div className="ai-preview-section">
                {/* Insight */}
                {aiPreview.analysis.insight && (
                  <div className="insight-card">
                    <div className="insight-icon">💡</div>
                    <p className="insight-text">{aiPreview.analysis.insight}</p>
                  </div>
                )}

                {/* Tasks Preview */}
                <div className="preview-section">
                  <h3 className="preview-title">
                    📋 Starter Tasks ({aiPreview.tasks.length})
                  </h3>
                  <div className="preview-list">
                    {aiPreview.tasks.slice(0, 5).map((task, index) => (
                      <div key={index} className="preview-item">
                        <div className="preview-item-header">
                          <span className="preview-item-title">{task.title}</span>
                          <span className="preview-item-badge">{task.category}</span>
                        </div>
                        {task.description && (
                          <p className="preview-item-description">{task.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Habits Preview */}
                <div className="preview-section">
                  <h3 className="preview-title">
                    🌱 Starter Habits ({aiPreview.habits.length})
                  </h3>
                  <div className="preview-list">
                    {aiPreview.habits.map((habit, index) => (
                      <div key={index} className="preview-item">
                        <div className="preview-item-header">
                          <span className="preview-item-title">{habit.name}</span>
                          <span className="preview-item-badge">{habit.frequency}</span>
                        </div>
                        {habit.description && (
                          <p className="preview-item-description">{habit.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="error-card">
                <span className="error-icon">⚠️</span>
                <p>{error}</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim().length > 0 && formData.goalsText.trim().length >= 20;
      case 2:
        return formData.focusAreas.length > 0;
      case 3:
        return true; // All fields optional
      case 4:
        return !aiGenerating;
      default:
        return true;
    }
  };

  return (
    <div className="onboarding-container">
      {/* Progress Bar */}
      <div className="onboarding-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
        <div className="progress-text">
          Step {currentStep} of {totalSteps}
        </div>
      </div>

      {/* Main Content */}
      <div className="onboarding-content">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="onboarding-footer">
        <div className="footer-left">
          <button
            className="btn-secondary-onboarding"
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>

        <div className="footer-right">
          {currentStep > 1 && (
            <button
              className="btn-secondary-onboarding"
              onClick={handleBack}
              disabled={loading}
            >
              ← Back
            </button>
          )}

          {currentStep < totalSteps ? (
            <button
              className="btn-primary-onboarding"
              onClick={handleNext}
              disabled={!canProceed() || aiGenerating}
            >
              {currentStep === 3 ? 'Generate Plan →' : 'Next →'}
            </button>
          ) : (
            <button
              className="btn-primary-onboarding btn-complete"
              onClick={handleComplete}
              disabled={loading || aiGenerating}
            >
              {loading ? 'Saving...' : 'Complete & Start! ✨'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
