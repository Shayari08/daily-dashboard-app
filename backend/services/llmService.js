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
    // Use onboarding-specific provider with higher token limit
    const onboardingOptions = {
      ...options,
      max_tokens: options.max_tokens || 2048 // Increase from 512 to 2048 for longer onboarding responses
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
      // Groq uses OpenAI-compatible API
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.groqModel,
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
    const prompt = `You are an adaptive productivity assistant. Generate 3-5 actionable task suggestions based on the following user goals and context.

User Goals:
${userGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Context:
${JSON.stringify(context, null, 2)}

For each task suggestion, provide:
1. Task title (concise, actionable)
2. Brief description
3. Estimated energy required (1-5, where 1 is low and 5 is high)
4. Reasoning (why this task is relevant)

Format your response as JSON array:
[
  {
    "title": "Task title",
    "description": "Brief description",
    "energy_required": 3,
    "reasoning": "Why this task matters"
  }
]

Return ONLY the JSON array, no additional text.`;

    const response = await this.generateCompletion(prompt, { temperature: 0.8 });
    
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
    const prompt = `Break down the following task into 3-5 smaller, manageable subtasks. Make each subtask concrete and achievable.

Task: ${task.title}
Description: ${task.description || 'No additional description'}

User Context:
${JSON.stringify(userContext, null, 2)}

For each subtask, provide:
1. Title (clear, actionable)
2. Description (brief, specific)
3. Estimated duration in minutes

Format as JSON array:
[
  {
    "title": "Subtask title",
    "description": "What to do",
    "estimated_duration": 30
  }
]

Return ONLY the JSON array.`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7 });
    
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

    const response = await this.generateCompletion(prompt, { temperature: 0.6 });
    
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
    const prompt = `Generate a ${insightType} insight based on the following user behavior data.

Data:
${JSON.stringify(behaviorData, null, 2)}

Provide:
1. Title (concise, engaging)
2. Content (2-3 sentences of insight)
3. Confidence level (low, medium, high)
4. Actionable suggestion (optional)

Be empathetic, supportive, and never judgmental. Focus on patterns, not failures.

Format as JSON:
{
  "title": "Insight title",
  "content": "Detailed insight",
  "confidence": "medium",
  "suggestion": "Optional action"
}

Return ONLY the JSON object.`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7 });
    
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
    const prompt = `You are a helpful productivity assistant. Answer the user's question based on the provided context.

Question: ${question}

Context:
${JSON.stringify(context, null, 2)}

Provide a clear, concise, and helpful answer. Be transparent about what information you're using to answer.

Response:`;

    const response = await this.generateCompletion(prompt, { temperature: 0.7 });
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
    const prompt = `Analyze this user's goals: "${goalsText}"

Extract:
- themes (2-4 keywords)
- insight (1-2 encouraging sentences)
- tone (positive/ambitious/cautious)

Return ONLY valid JSON:
{"themes":["keyword1","keyword2"],"insight":"Encouraging message","tone":"positive"}`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.7 });

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

    const prompt = `Generate 5-7 personalized starter tasks for a user with these goals:
"${goalsText}"

SELECTED Focus areas (ONLY generate tasks for these): ${focusAreas.join(', ')}
Work style: ${preferences.workStyle || 'balanced'}

IMPORTANT: ONLY create tasks related to the selected focus areas above. Do NOT add fitness, exercise, or health tasks unless the user explicitly selected health/fitness as a focus area.

Create actionable, specific tasks. Return ONLY valid JSON array:
[
  {
    "title": "Task name (actionable)",
    "description": "What to do (1 sentence)",
    "category": "${focusAreas[0] || 'General'}",
    "priority": "medium",
    "estimatedDuration": 30,
    "reasoning": "Why this helps (brief)"
  }
]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8 });

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
      pendingTasks
    } = context;

    const metricsLines = [];
    if (specificMetrics?.exerciseDays) metricsLines.push(`Exercise goal: ${specificMetrics.exerciseDays} days/week`);
    if (specificMetrics?.learningMinutes) metricsLines.push(`Learning goal: ${specificMetrics.learningMinutes} min/day`);
    if (specificMetrics?.sleepHours) metricsLines.push(`Sleep goal: ${specificMetrics.sleepHours} hours/night`);

    const routineLines = [];
    if (dailyRoutine?.morningRoutine) routineLines.push('Wants a morning routine');
    if (dailyRoutine?.eveningRoutine) routineLines.push('Wants an evening routine');

    const goalsListText = (recurringGoals || [])
      .map(g => `- ${g.title} (${g.frequency === 'daily' ? 'daily' : g.times_per_week + 'x/week'})`)
      .join('\n');

    const recentText = (recentCompletedTasks || [])
      .map(t => `- ${t.title} (${new Date(t.completed_at).toLocaleDateString()})`)
      .join('\n');

    const pendingText = (pendingTasks || [])
      .map(t => `- ${t.title}`)
      .join('\n');

    const prompt = `You are a daily task planner. The user has goals but struggles to integrate them into daily life. Create concrete tasks they can do TODAY.

Their goals: "${goalsText || 'Not specified'}"
Focus areas: ${(focusAreas || []).join(', ') || 'General'}
Work style: ${workStyle || 'balanced'}
${metricsLines.length > 0 ? '\nSpecific metrics:\n' + metricsLines.join('\n') : ''}
${routineLines.length > 0 ? '\nRoutine preferences:\n' + routineLines.join('\n') : ''}

Their recurring commitments (already tracked separately, don't overlap):
${goalsListText || 'None yet'}

Recently completed tasks (don't repeat these):
${recentText || 'None'}

Currently pending tasks (don't duplicate these):
${pendingText || 'None'}

Generate 5-7 NEW tasks for today. Each must be:
- Completable in one sitting (15-60 min)
- A specific action (GOOD: "Do a 20-min bodyweight workout", BAD: "Work on fitness")
- Different from existing/recent tasks
- Complementary to recurring goals (fill gaps, not overlap)
- Related to their selected focus areas

Return ONLY valid JSON array:
[
  {
    "title": "Specific actionable task",
    "description": "What to do (1 sentence)",
    "category": "Focus area",
    "estimatedDuration": 30
  }
]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8 });

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

    const tasksText = (currentTasks || [])
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

    const prompt = `You are a knowledgeable mentor and curator who recommends specific, high-quality learning resources. You know real books, real YouTube channels, real researchers, and real publications. Your recommendations should feel like they come from someone who has actually consumed these resources.

The user has the following goals and context:

GOALS: "${goalsText || 'General self-improvement'}"
FOCUS AREAS: ${(focusAreas || []).join(', ') || 'General'}
WORK STYLE: ${workStyle || 'balanced'}

Their active recurring commitments:
${goalsListText || 'None'}

What they are currently working on:
${tasksText || 'No active tasks'}

FEEDBACK FROM PAST RECOMMENDATIONS (use this to calibrate):
Resources they LIKED (recommend MORE like these):
${likedText}

Resources they DISLIKED (recommend LESS like these):
${dislikedText}

Generate exactly 5 resource recommendations. Each must be:
- A SPECIFIC resource with a real or realistic title (e.g., "Atomic Habits by James Clear" not "a book about habits")
- Include the likely author, channel, or publication name
- Directly relevant to one of their goals or focus areas
- Varied in type (mix of videos, articles, papers, books, podcasts, or courses)
- Include a precise search query that would find this exact resource on Google or YouTube
- Explain in one sentence WHY this resource matters for THIS specific user

${likedItems.length > 0 ? 'Since they liked certain resources, lean into that style and topic depth.' : ''}
${dislikedItems.length > 0 ? 'Since they disliked certain resources, avoid similar topics, formats, or difficulty levels.' : ''}

Return ONLY valid JSON array:
[
  {
    "title": "Specific Resource Title",
    "description": "2-3 sentence description of what the user will learn",
    "resource_type": "video|article|paper|book|podcast|course",
    "search_query": "exact search query to find this on Google or YouTube",
    "author_or_source": "Author name, channel, or publication",
    "relevance_reason": "One sentence connecting this to the user's specific goal"
  }
]`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8 });

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

    const prompt = `You are a gentle habit-building coach. Generate 3-5 starter habits for this user based on their onboarding responses.

User's Goals: ${goalsText}

SELECTED Focus Areas (ONLY generate habits for these): ${focusAreas.join(', ')}

Daily Routine:
- Morning routine preference: ${dailyRoutine.morningRoutine ? 'Yes' : 'No'}
- Evening routine preference: ${dailyRoutine.eveningRoutine ? 'Yes' : 'No'}

Preferences:
- Work style: ${preferences.workStyle || 'Not specified'}
- Mindfulness interest: ${preferences.mindfulness ? 'Yes' : 'No'}

IMPORTANT: ONLY create habits related to the selected focus areas listed above. Do NOT add fitness, exercise, workout, or health habits unless the user explicitly selected health/fitness as a focus area.

For each habit, provide:
1. Name (include relevant emoji)
2. Frequency (daily, weekly, or custom)
3. Description (brief, encouraging)
4. Category (matching their focus areas)
5. Why this habit matters

Make habits:
- Small and achievable (easy wins)
- Aligned with their routine preferences
- Supportive of their stated goals
- Varied (not all same category)

Format as JSON array:
[
  {
    "name": "🌅 Morning Meditation",
    "frequency": "daily",
    "description": "Start your day with calm",
    "category": "Mindfulness",
    "reasoning": "Builds mental clarity"
  }
]

Return ONLY the JSON array.`;

    const response = await this.generateOnboardingCompletion(prompt, { temperature: 0.8 });

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
