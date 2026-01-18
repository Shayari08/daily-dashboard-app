import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Target, Clock, Zap, Bell } from 'lucide-react';
import './Onboarding.css';

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    short_term_goals: ['', '', ''],
    long_term_goals: ['', ''],
    work_hours_start: '09:00',
    work_hours_end: '17:00',
    preferred_task_length: 30,
    energy_pattern: 'morning',
    strictness_level: 'gentle',
    track_energy: false,
    track_pain: false,
    track_cycle: false,
    notification_preferences: { email: false, push: false }
  });

  const handleArrayChange = (field, index, value) => {
    const updated = [...formData[field]];
    updated[index] = value;
    setFormData({ ...formData, [field]: updated });
  };

  const handleSubmit = async () => {
    try {
      // Filter out empty goals
      const cleanedData = {
        ...formData,
        short_term_goals: formData.short_term_goals.filter(g => g.trim()),
        long_term_goals: formData.long_term_goals.filter(g => g.trim()),
        onboarding_completed: true
      };

      await axios.put('/api/profile', cleanedData, { withCredentials: true });
      toast.success('Profile setup complete!');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Failed to save profile');
      console.error(error);
    }
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="onboarding-step"
          >
            <div className="step-icon">
              <Target size={32} />
            </div>
            <h2>What are your goals?</h2>
            <p className="step-description">
              Help us understand what you're working towards. These can be broad or specific.
            </p>

            <div className="form-group">
              <label>Short-term goals (next few months)</label>
              {formData.short_term_goals.map((goal, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Goal ${i + 1}`}
                  value={goal}
                  onChange={(e) => handleArrayChange('short_term_goals', i, e.target.value)}
                />
              ))}
            </div>

            <div className="form-group">
              <label>Long-term goals (this year and beyond)</label>
              {formData.long_term_goals.map((goal, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Goal ${i + 1}`}
                  value={goal}
                  onChange={(e) => handleArrayChange('long_term_goals', i, e.target.value)}
                />
              ))}
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="onboarding-step"
          >
            <div className="step-icon">
              <Clock size={32} />
            </div>
            <h2>Your daily rhythm</h2>
            <p className="step-description">
              Tell us about your typical day so we can suggest tasks at the right times.
            </p>

            <div className="form-group">
              <label>Work/focus hours</label>
              <div className="time-inputs">
                <input
                  type="time"
                  value={formData.work_hours_start}
                  onChange={(e) => setFormData({ ...formData, work_hours_start: e.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={formData.work_hours_end}
                  onChange={(e) => setFormData({ ...formData, work_hours_end: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Preferred task length (minutes)</label>
              <input
                type="number"
                min="15"
                max="120"
                step="15"
                value={formData.preferred_task_length}
                onChange={(e) => setFormData({ ...formData, preferred_task_length: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>When do you have the most energy?</label>
              <select
                value={formData.energy_pattern}
                onChange={(e) => setFormData({ ...formData, energy_pattern: e.target.value })}
              >
                <option value="morning">Morning person</option>
                <option value="afternoon">Afternoon peak</option>
                <option value="evening">Evening owl</option>
                <option value="varies">It varies</option>
              </select>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="onboarding-step"
          >
            <div className="step-icon">
              <Zap size={32} />
            </div>
            <h2>Optional state tracking</h2>
            <p className="step-description">
              We never make assumptions. Only track what you explicitly choose to share.
            </p>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.track_energy}
                  onChange={(e) => setFormData({ ...formData, track_energy: e.target.checked })}
                />
                <span>Track daily energy levels</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.track_pain}
                  onChange={(e) => setFormData({ ...formData, track_pain: e.target.checked })}
                />
                <span>Track pain/migraine days</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.track_cycle}
                  onChange={(e) => setFormData({ ...formData, track_cycle: e.target.checked })}
                />
                <span>Track hormonal cycle phase</span>
              </label>
            </div>

            <div className="info-box">
              <p><strong>Your data stays private.</strong> We use this information only to adapt task suggestions to your current state. You can disable tracking anytime.</p>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="onboarding-step"
          >
            <div className="step-icon">
              <Bell size={32} />
            </div>
            <h2>Preferences</h2>
            <p className="step-description">
              How would you like the system to guide you?
            </p>

            <div className="form-group">
              <label>System approach</label>
              <select
                value={formData.strictness_level}
                onChange={(e) => setFormData({ ...formData, strictness_level: e.target.value })}
              >
                <option value="gentle">Gentle - Suggestions only, no pressure</option>
                <option value="moderate">Moderate - Balanced guidance</option>
                <option value="structured">Structured - Clear prioritization</option>
              </select>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.notification_preferences.email}
                  onChange={(e) => setFormData({
                    ...formData,
                    notification_preferences: { ...formData.notification_preferences, email: e.target.checked }
                  })}
                />
                <span>Email notifications</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.notification_preferences.push}
                  onChange={(e) => setFormData({
                    ...formData,
                    notification_preferences: { ...formData.notification_preferences, push: e.target.checked }
                  })}
                />
                <span>Push notifications</span>
              </label>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="onboarding-progress">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`progress-dot ${s === step ? 'active' : ''} ${s < step ? 'complete' : ''}`}
            />
          ))}
        </div>

        {renderStep()}

        <div className="onboarding-actions">
          {step > 1 && (
            <button
              className="btn-ghost"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}

          {step < 4 ? (
            <button
              className="btn-primary"
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSubmit}
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
