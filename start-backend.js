// Simple test backend - just run: node start-backend.js

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Mock user
const mockUser = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com'
};

// Sample tasks
let tasks = [
  {
    id: '1',
    user_id: mockUser.id,
    title: 'Try drag and drop',
    description: 'Grab the ⋮⋮ handle and drag me around!',
    energy_required: 3,
    status: 'pending',
    created_by: 'manual',
    priority_score: 75,
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    user_id: mockUser.id,
    title: 'Test task completion',
    description: 'Click the Complete button to mark as done',
    energy_required: 2,
    status: 'pending',
    created_by: 'ai',
    priority_score: 60,
    created_at: new Date().toISOString()
  },
  {
    id: '3',
    user_id: mockUser.id,
    title: 'Add your own task',
    description: 'Use the Add Task button to create a new one',
    energy_required: 1,
    status: 'pending',
    created_by: 'manual',
    priority_score: 50,
    created_at: new Date().toISOString()
  }
];

// Auth endpoints
app.get('/api/auth/me', (req, res) => {
  console.log('✓ Auth request received');
  res.json({ user: mockUser });
});

app.post('/api/auth/logout', (req, res) => {
  console.log('✓ Logout request received');
  res.json({ message: 'Logged out' });
});

// Onboarding mock endpoints
let mockOnboardingStatus = { needsOnboarding: true };

app.get('/api/onboarding/status', (req, res) => {
  console.log('✓ Onboarding status request');
  res.json(mockOnboardingStatus);
});

app.post('/api/onboarding/complete', (req, res) => {
  console.log('✓ Onboarding complete request (skipped:', !!req.body.skipped, ')');
  mockOnboardingStatus = { needsOnboarding: false };
  res.json({
    success: true,
    message: req.body.skipped ? 'Onboarding skipped' : 'Onboarding completed',
    tasksCreated: 0,
    habitsCreated: 0,
    tasks: [],
    habits: []
  });
});

app.post('/api/onboarding/skip', (req, res) => {
  console.log('✓ Onboarding skip request');
  mockOnboardingStatus = { needsOnboarding: false };
  res.json({
    success: true,
    message: 'Onboarding skipped successfully',
    tasksCreated: 0,
    habitsCreated: 0,
    tasks: [],
    habits: []
  });
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  console.log('✓ Get tasks request');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  res.json({ tasks: pendingTasks });
});

app.post('/api/tasks', (req, res) => {
  console.log('✓ Create task request:', req.body.title);
  const newTask = {
    id: Date.now().toString(),
    user_id: mockUser.id,
    title: req.body.title,
    description: req.body.description || '',
    energy_required: req.body.energy_required || 3,
    status: 'pending',
    created_by: 'manual',
    priority_score: 50,
    created_at: new Date().toISOString()
  };
  tasks.push(newTask);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  console.log('✓ Update task request:', req.params.id);
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body);
    res.json(task);
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  console.log('✓ Delete task request:', req.params.id);
  tasks = tasks.filter(t => t.id !== req.params.id);
  res.json({ message: 'Task deleted' });
});

app.post('/api/tasks/generate-and-save', (req, res) => {
  console.log('✓ Generate tasks request');
  const sampleGen = [
    { id: Date.now().toString(), user_id: mockUser.id, title: 'Complete a 25-minute Pomodoro focus session', description: 'Single-task with zero distractions', category: 'Productivity', status: 'pending', created_by: 'ai' },
    { id: (Date.now() + 1).toString(), user_id: mockUser.id, title: 'Do 20 minutes of brisk movement or walking', description: 'Recharge physical energy for the day', category: 'Health & Fitness', status: 'pending', created_by: 'ai' },
    { id: (Date.now() + 2).toString(), user_id: mockUser.id, title: 'Read 15 pages of your current learning book', description: 'Take notes on the main takeaway', category: 'Career & Learning', status: 'pending', created_by: 'ai' }
  ];
  tasks.push(...sampleGen);
  res.json({ success: true, count: sampleGen.length, tasks: sampleGen });
});

// Recurring goals mock storage
let recurringGoals = [
  { id: 'rg-1', user_id: mockUser.id, title: 'Drink 8 glasses of water', frequency: 'daily', times_per_week: 7, streak: 3, best_streak: 5, is_active: true, due_today: true, completed_today: false, total_completions: 12 },
  { id: 'rg-2', user_id: mockUser.id, title: 'Exercise 3x per week', frequency: 'x_per_week', times_per_week: 3, times_completed_this_week: 1, streak: 2, best_streak: 4, is_active: true, due_today: true, completed_today: false, total_completions: 8 }
];

app.get('/api/recurring-goals/today-status', (req, res) => {
  res.json({ success: true, goals: recurringGoals });
});

app.post('/api/recurring-goals', (req, res) => {
  const goal = {
    id: Date.now().toString(),
    user_id: mockUser.id,
    title: req.body.title,
    frequency: req.body.frequency || 'daily',
    times_per_week: req.body.timesPerWeek || (req.body.frequency === 'daily' ? 7 : 1),
    streak: 0,
    best_streak: 0,
    is_active: true,
    due_today: true,
    completed_today: false,
    total_completions: 0
  };
  recurringGoals.push(goal);
  res.json({ success: true, goal });
});

app.post('/api/recurring-goals/:id/complete', (req, res) => {
  const g = recurringGoals.find(g => g.id === req.params.id);
  if (g) {
    g.completed_today = true;
    g.streak = (g.streak || 0) + 1;
    g.best_streak = Math.max(g.best_streak || 0, g.streak);
    g.total_completions = (g.total_completions || 0) + 1;
    res.json({ success: true, goal: g });
  } else {
    res.status(404).json({ error: 'Goal not found' });
  }
});

app.delete('/api/recurring-goals/:id', (req, res) => {
  recurringGoals = recurringGoals.filter(g => g.id !== req.params.id);
  res.json({ success: true, message: 'Goal deleted' });
});

// Recommendations mock
let recommendations = [
  { id: 'rec-1', title: 'Atomic Habits by James Clear', description: 'Tiny changes, remarkable results.', resource_type: 'book', author_or_source: 'James Clear', search_query: 'Atomic Habits James Clear', relevance_reason: 'Reinforces daily consistency.' },
  { id: 'rec-2', title: 'Huberman Lab: Master Your Sleep & Energy Protocols', description: 'Science-backed protocols for high energy.', resource_type: 'podcast', author_or_source: 'Dr. Andrew Huberman', search_query: 'Huberman Lab sleep energy', relevance_reason: 'Boosts daytime stamina and alertness.' },
  { id: 'rec-3', title: 'Deep Work by Cal Newport', description: 'How to focus without distraction.', resource_type: 'book', author_or_source: 'Cal Newport', search_query: 'Deep Work Cal Newport', relevance_reason: 'Helps carve out uninterrupted focus blocks.' }
];

app.get('/api/recommendations', (req, res) => {
  res.json({ recommendations });
});

app.post('/api/recommendations/generate', (req, res) => {
  res.json({ success: true, count: recommendations.length, recommendations });
});

app.post('/api/recommendations/:id/react', (req, res) => {
  const rec = recommendations.find(r => r.id === req.params.id);
  if (rec) rec.reaction = req.body.reaction;
  res.json({ success: true });
});

app.post('/api/recommendations/:id/add-to-tasks', (req, res) => {
  const rec = recommendations.find(r => r.id === req.params.id);
  if (rec) {
    rec.added_to_tasks = true;
    tasks.push({
      id: Date.now().toString(),
      user_id: mockUser.id,
      title: `Explore: ${rec.title}`,
      description: rec.description || '',
      category: 'Learning',
      status: 'pending',
      created_by: 'ai'
    });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'test',
    message: 'Test mode - no database required'
  });
});

// Metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Test mode - metrics disabled\n');
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  🚀 Backend Test Server Running');
  console.log('========================================');
  console.log('');
  console.log(`  URL: http://localhost:${PORT}`);
  console.log('  Mode: TEST (mock data)');
  console.log('');
  console.log('  ✓ No OAuth needed`);
  console.log('  ✓ No database needed');
  console.log('  ✓ 3 sample tasks loaded');
  console.log('');
  console.log('  Next: Start frontend in another terminal');
  console.log('');
  console.log('========================================');
});
