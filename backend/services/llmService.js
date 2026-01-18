const axios = require('axios');

class LLMService {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.LLM_MODEL || 'llama3';
    this.fallbackEnabled = process.env.ENABLE_FALLBACK === 'true';
  }

  async generateCompletion(prompt, options = {}) {
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
        timeout: 30000 // 30 second timeout
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

  fallbackResponse(prompt, options) {
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
