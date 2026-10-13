const axios = require('axios');

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'ollama'; // 'ollama' or 'huggingface' or 'groq'
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.LLM_MODEL || 'llama3';
    this.hfToken = process.env.HUGGINGFACE_API_KEY;
    this.hfModel = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
    this.fallbackEnabled = process.env.ENABLE_FALLBACK === 'true';

    // Onboarding-specific provider (can be different from main provider)
    this.onboardingProvider = process.env.ONBOARDING_LLM_PROVIDER || 'groq';
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.groqModel = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
  }

  async generateCompletion(prompt, options = {}) {
    if (this.provider === 'groq') {
      return this.generateGroqCompletion(prompt, options);
    } else if (this.provider === 'huggingface') {
      return this.generateHuggingFaceCompletion(prompt, options);
    } else {
      return this.generateOllamaCompletion(prompt, options);
    }
  }

  async generateOnboardingCompletion(prompt, options = {}) {
    const onboardingOptions = {
      ...options,
      max_tokens: options.max_tokens || 800
    };

    if (this.onboardingProvider === 'groq') {
      return this.generateGroqCompletion(prompt, onboardingOptions);
    } else if (this.onboardingProvider === 'huggingface') {
      return this.generateHuggingFaceCompletion(prompt, onboardingOptions);
    } else {
      return this.generateOllamaCompletion(prompt, onboardingOptions);
    }
  }

  async generateHuggingFaceCompletion(prompt, options = {}) {
    try {
      // Use chat completion endpoint (new format as of July 2025)
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${this.hfModel}/v1/chat/completions`,
        {
          model: this.hfModel,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          max_tokens: options.max_tokens || 512
        },
        {
          headers: {
            'Authorization': `Bearer ${this.hfToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      // Extract text from chat completion response
      const text = response.data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        text: text,
        model: this.hfModel
      };
    } catch (error) {
      console.error('Hugging Face generation error:', error.message);
      console.error('Response:', error.response?.data);

      if (this.fallbackEnabled) {
        return this.fallbackResponse(prompt, options);
      }

      return {
        success: false,
        error: error.message,
        fallback: false
      };
    }
  }

  async generateGroqCompletion(prompt, options = {}) {
    try {
      const messages = [];
      if (options.system) {
        messages.push({ role: 'system', content: options.system });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.groqModel,
          messages,
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          max_tokens: options.max_tokens || 512
        },
        {
          headers: {
            'Authorization': `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const text = response.data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        text: text,
        model: this.groqModel
      };
    } catch (error) {
      console.error('Groq generation error:', error.message);
      console.error('Response:', error.response?.data);

      if (this.fallbackEnabled) {
        return this.fallbackResponse();
      }

      return {
        success: false,
        error: error.message,
        fallback: false
      };
    }
  }

  async generateOllamaCompletion(prompt, options = {}) {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
        }
      }, {
        timeout: 60000 // 60 second timeout for complex prompts
      });

      return {
        success: true,
        text: response.data.response,
        model: this.model
      };
    } catch (error) {
      console.error('LLM generation error:', error.message);

      if (this.fallbackEnabled) {
        return this.fallbackResponse(prompt, options);
      }

      return {
        success: false,
        error: error.message,
        fallback: false
      };
    }
  }

  async generateTaskSuggestions(userGoals, context = {}) {
    const prompt = `Goals: ${userGoals.join('; ')}
Context: ${JSON.stringify(context)}

Generate 3-5 actionable tasks. JSON array only:
[{"title":"...","description":"one sentence","energy_required":3,"reasoning":"one sentence"}]`;

    const response = await this.generateCompletion(prompt, { temperature: 0.8, max_tokens: 400 });
    
    if (response.success) {
      try {
        const tasks = JSON.parse(response.text);
        return { success: true, tasks };
      } catch (error) {
        // If JSON parsing fails, try to extract tasks manually
        return { success: false, error: 'Failed to parse task suggestions' };
      }
    }
    
    return response;
  }

  async breakdownTask(task, userContext = {}) {
    const prompt = `Task: "${task.title}"${task.description ? '\nDetails: ' + task.description : ''}
Context: ${JSON.stringify(userContext)}

Break into 3-5 concrete subtasks. JSON array only:
[{"title":"...","description":"one sentence","estimated_duration":30}]`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7, max_tokens: 400 });
    
    if (response.success) {
      try {
        const subtasks = JSON.parse(response.text);
        return { success: true, subtasks, reasoning: "Task broken down into manageable steps" };
      } catch (error) {
        return { success: false, error: 'Failed to parse subtask breakdown' };
      }
    }
    
    return response;
  }

  async detectHabitPattern(actions, taskName) {
    const prompt = `Analyze the following user actions to determine if they form a habit pattern.

Task: ${taskName}
Recent completions: ${actions.length}
Pattern: ${actions.map(a => a.date).join(', ')}

Determine:
1. Is this a habit? (yes/no)
2. Frequency (daily, weekly, custom)
3. Evidence supporting this pattern
4. Suggested habit name

Format as JSON:
{
  "is_habit": true/false,
  "frequency": "daily",
  "evidence": "Brief explanation",
  "suggested_name": "Habit name"
}

Return ONLY the JSON object.`;

    const response = await this.generateCompletion(prompt, { temperature: 0.6, max_tokens: 150 });

    if (response.success) {
      try {
        const analysis = JSON.parse(response.text);
        return { success: true, analysis };
      } catch (error) {
        return { success: false, error: 'Failed to parse habit analysis' };
      }
    }
    
    return response;
  }

  async generateInsight(behaviorData, insightType) {
    const prompt = `Generate a ${insightType} insight from this behavior data: ${JSON.stringify(behaviorData)}
Be empathetic, focus on patterns not failures. JSON only:
{"title":"concise title","content":"2-3 sentences","confidence":"low|medium|high","suggestion":"optional one sentence"}`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7, max_tokens: 200 });
    
    if (response.success) {
      try {
        const insight = JSON.parse(response.text);
        return { success: true, insight };
      } catch (error) {
        return { success: false, error: 'Failed to parse insight' };
      }
    }
    
    return response;
  }

  async answerQuestion(question, context) {
    const prompt = `Context: ${JSON.stringify(context)}
Question: ${question}
Answer concisely:`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7, max_tokens: 350 });
    return response;
  }

  extractJSON(text) {
    // Try to extract JSON from markdown code blocks or text with explanations
    try {
      // First, try direct parse
      return JSON.parse(text);
    } catch (e) {
      // Try to find JSON in markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try to find JSON object or array without markdown
      const objectMatch = text.match(/(\{[\s\S]*\})/);
      const arrayMatch = text.match(/(\[[\s\S]*\])/);

      if (objectMatch) {
        return JSON.parse(objectMatch[1]);
      }
      if (arrayMatch) {
        return JSON.parse(arrayMatch[1]);
      }

      throw new Error('No valid JSON found in response');
    }
  }

  async analyzeOnboardingGoals(goalsText) {
    const system = 'Extract goal themes and return JSON only. No prose.';
    const prompt = `Goals: "${goalsText}"
Return: {"themes":["kw1","kw2"],"insight":"1-2 encouraging sentences.","tone":"positive|ambitious|cautious"}`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.6, max_tokens: 120, system });

    if (response.success) {
      try {
        const analysis = this.extractJSON(response.text);
        return { success: true, analysis };
      } catch (error) {
        console.error('Failed to parse goals analysis:', response.text);
        return { success: false, error: 'Failed to parse goals analysis' };
      }
    }

    return response;
  }

  async generateOnboardingTasks(onboardingData) {
    const { goalsText, focusAreas, dailyRoutine, preferences } = onboardingData;

    const system = 'You generate first-day starter tasks as a JSON array. Return JSON only — no prose, no markdown.';

    const prompt = `Goals: "${goalsText}"
Focus areas (only these): ${focusAreas.join(', ')}
Work style: ${preferences?.workStyle || 'balanced'} | Morning routine: ${dailyRoutine?.morningRoutine ? 'yes' : 'no'} | Evening: ${dailyRoutine?.eveningRoutine ? 'yes' : 'no'}

Generate 5-7 tasks. Constraints: completable today in 15-60 min; first 1-2 tasks under 20 min (quick wins); specific actions not vague goals; at least one task supports a habit; one setup task per goal area max; strictly within listed focus areas.

JSON array only:
[{"title":"...","description":"one sentence","category":"...","priority":"high|medium|low","estimatedDuration":30,"reasoning":"one sentence"}]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8, max_tokens: 650, system });

    if (response.success) {
      try {
        const tasks = this.extractJSON(response.text);
        return { success: true, tasks };
      } catch (error) {
        console.error('Failed to parse task generation:', response.text);
        return { success: false, error: 'Failed to parse task generation' };
      }
    }

    return response;
  }

  async generateDailyTasks(context) {
    const {
      goalsText,
      focusAreas,
      workStyle,
      specificMetrics,
      dailyRoutine,
      recurringGoals,
      recentCompletedTasks,
      categoryProgress,
      pendingTasks
    } = context;

    const metricsLines = [];
    if (specificMetrics?.exerciseDays) metricsLines.push(`Exercise goal: ${specificMetrics.exerciseDays} days/week`);
    if (specificMetrics?.learningMinutes) metricsLines.push(`Learning goal: ${specificMetrics.learningMinutes} min/day`);
    if (specificMetrics?.sleepHours) metricsLines.push(`Sleep goal: ${specificMetrics.sleepHours} hours/night`);

    const routineLines = [];
    if (dailyRoutine?.morningRoutine) routineLines.push('Morning routine');
    if (dailyRoutine?.eveningRoutine) routineLines.push('Evening routine');

    const goalsListText = (recurringGoals || [])
      .map(g => `- ${g.title} (${g.frequency === 'daily' ? 'daily' : g.times_per_week + 'x/week'})`)
      .join('\n');

    // Build progress picture: which areas have been worked on vs neglected
    const progressMap = {};
    (categoryProgress || []).forEach(row => { progressMap[row.category] = parseInt(row.completed_count); });
    const focusAreasArr = focusAreas || [];
    const progressLines = focusAreasArr.map(area => {
      const count = progressMap[area] || 0;
      if (count === 0) return `- ${area}: NO tasks completed yet (NEGLECTED — high priority)`;
      if (count <= 2) return `- ${area}: ${count} task(s) completed in last 30 days (low engagement)`;
      if (count <= 6) return `- ${area}: ${count} tasks completed (moderate progress)`;
      return `- ${area}: ${count} tasks completed (strong momentum — keep it up)`;
    });

    const recentText = (recentCompletedTasks || [])
      .slice(0, 15)
      .map(t => `- [${t.category || 'General'}] ${t.title} (${new Date(t.completed_at).toLocaleDateString()})`)
      .join('\n');

    const pendingText = (pendingTasks || [])
      .map(t => `- [${t.category || 'General'}] ${t.title}`)
      .join('\n');

    const system = 'You generate today\'s tasks as a JSON array calibrated to the user\'s actual progress. Return JSON only — no prose, no markdown.';

    const prompt = `Goals: "${goalsText || 'Not specified'}"
Focus areas: ${focusAreasArr.join(', ') || 'General'} | Work style: ${workStyle || 'balanced'}${metricsLines.length > 0 ? ' | ' + metricsLines.join(', ') : ''}${routineLines.length > 0 ? ' | ' + routineLines.join(', ') : ''}

Progress last 30 days (prioritize NEGLECTED areas with 2+ tasks):
${progressLines.length > 0 ? progressLines.join('\n') : 'No data — treat all areas equally'}

Recurring commitments (do NOT overlap):
${goalsListText || 'None'}

Recently completed — last 14 days (do NOT repeat):
${recentText || 'None'}

Pending tasks (do NOT duplicate):
${pendingText || 'None'}

Generate 5-7 tasks for TODAY: specific and completable in 15-45 min, no repeats. NEVER output broad umbrella goals like "Focus on...", "Improve...", or multi-day projects. Every title MUST begin with an action verb (e.g., "Review...", "Draft...", "Do 20-min...", "Read 15 pages...") with concrete completion criteria.

JSON array only:
[{"title":"...","description":"one sentence","category":"...","estimatedDuration":30}]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8, max_tokens: 650, system });

    if (response.success) {
      try {
        const tasks = this.extractJSON(response.text);
        return { success: true, tasks };
      } catch (error) {
        console.error('Failed to parse daily task generation:', response.text);
        return { success: false, error: 'Failed to parse daily task generation' };
      }
    }

    return response;
  }

  async generateRecommendations(context) {
    const {
      goalsText,
      focusAreas,
      workStyle,
      recurringGoals,
      currentTasks,
      pastFeedback
    } = context;

    const goalsListText = (recurringGoals || [])
      .map(g => `- ${g.title} (${g.category || 'General'}, ${g.frequency})`)
      .join('\n');

    const tasksText = (currentTasks || []).slice(0, 10)
      .map(t => `- ${t.title}${t.category ? ` [${t.category}]` : ''}`)
      .join('\n');

    const likedItems = (pastFeedback || []).filter(f => f.reaction === 'liked');
    const dislikedItems = (pastFeedback || []).filter(f => f.reaction === 'disliked');

    const likedText = likedItems.length > 0
      ? likedItems.map(f => `- "${f.title}" (${f.resource_type})`).join('\n')
      : 'None yet';

    const dislikedText = dislikedItems.length > 0
      ? dislikedItems.map(f => `- "${f.title}" (${f.resource_type})`).join('\n')
      : 'None yet';

    const system = `You are a well-read mentor who recommends specific, named resources. Rules:
- Real title + real author/channel always (e.g. "Deep Work by Cal Newport", not "a productivity book")
- Match format to need: skill-building→course/book, staying current→newsletter/talk, building→case study, mindset→podcast/book, theory→textbook/lecture
- relevance_reason must name the user's specific goal, not a generic benefit
- Avoid anything similar to disliked items; follow direction of liked items
Return JSON array only — no prose.`;

    const prompt = `Goals: "${goalsText || 'General self-improvement'}"
Focus: ${(focusAreas || []).join(', ') || 'General'} | Work style: ${workStyle || 'balanced'}

Currently working on: ${tasksText || 'nothing tracked'}
Recurring commitments: ${goalsListText || 'none'}
Liked: ${likedText}
Disliked: ${dislikedText}

Generate exactly 5 recommendations.
JSON array only:
[{"title":"...","description":"2 sentences","resource_type":"video|article|paper|book|podcast|course","search_query":"...","author_or_source":"...","relevance_reason":"one sentence naming their specific goal"}]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8, max_tokens: 900, system });

    if (response.success) {
      try {
        const recommendations = this.extractJSON(response.text);
        return { success: true, recommendations };
      } catch (error) {
        console.error('Failed to parse recommendations:', response.text);
        return { success: false, error: 'Failed to parse recommendations' };
      }
    }

    return response;
  }

  async generateOnboardingHabits(onboardingData) {
    const { goalsText, focusAreas, dailyRoutine, preferences, aiAnalysis } = onboardingData;

    const system = `You design first-day habit stacks as a JSON array. Rules: start tiny (5-15 min max); anchor each habit to an existing routine (mention the anchor); achievable on day one; directly compounds toward a stated goal; varied timing if morning+evening both wanted; strictly within the stated focus areas. Return JSON only.`;

    const prompt = `Goals: "${goalsText}"
Focus areas (only these): ${focusAreas.join(', ')}
Morning routine: ${dailyRoutine?.morningRoutine ? 'yes' : 'no'} | Evening: ${dailyRoutine?.eveningRoutine ? 'yes' : 'no'} | Mindfulness: ${preferences?.mindfulness ? 'yes' : 'no'}

Generate 3-5 habits. Include the anchor point in each description.
JSON array only:
[{"name":"emoji Name","frequency":"daily|weekly","description":"what to do + anchor point, 1-2 sentences","category":"...","reasoning":"one sentence on compounding effect"}]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8, max_tokens: 550, system });

    if (response.success) {
      try {
        const habits = this.extractJSON(response.text);
        return { success: true, habits };
      } catch (error) {
        console.error('Failed to parse habit generation:', response.text);
        return { success: false, error: 'Failed to parse habit generation' };
      }
    }

    return response;
  }

  fallbackResponse() {
    // Simple fallback for when LLM is unavailable
    return {
      success: true,
      text: "AI assistant is temporarily unavailable. Core task management features remain functional.",
      fallback: true
    };
  }

  async checkHealth() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, {
        timeout: 5000
      });
      return {
        available: true,
        models: response.data.models || []
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }
}

module.exports = new LLMService();
