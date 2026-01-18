const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const mockUser = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com'
};

let tasks = [
  {
    id: '1',
    user_id: mockUser.id,
    title: 'Try drag and drop',
    description: 'Grab the handle and drag me around!',
    energy_required: 3,
    status: 'pending',
    created_by: 'manual',
    priority_score: 75
  },
  {
    id: '2',
    user_id: mockUser.id,
    title: 'Test task completion',
    description: 'Click the Complete button',
    energy_required: 2,
    status: 'pending',
    created_by: 'ai',
    priority_score: 60
  },
  {
    id: '3',
    user_id: mockUser.id,
    title: 'Add your own task',
    description: 'Use the Add Task button',
    energy_required: 1,
    status: 'pending',
    created_by: 'manual',
    priority_score: 50
  }
];

app.get('/api/auth/me', (req, res) => {
  console.log('Auth request received');
  res.json({ user: mockUser });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

app.get('/api/tasks', (req, res) => {
  console.log('Get tasks request');
  res.json({ tasks: tasks.filter(t => t.status === 'pending') });
});

app.post('/api/tasks', (req, res) => {
  console.log('Create task:', req.body.title);
  const newTask = {
    id: Date.now().toString(),
    user_id: mockUser.id,
    title: req.body.title,
    description: req.body.description || '',
    energy_required: req.body.energy_required || 3,
    status: 'pending',
    created_by: 'manual',
    priority_score: 50
  };
  tasks.push(newTask);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  console.log('Update task:', req.params.id);
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body);
    res.json(task);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter(t => t.id !== req.params.id);
  res.json({ message: 'Deleted' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'test' });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Test mode\n');
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  Backend Test Server Running');
  console.log('========================================');
  console.log('  URL: http://localhost:' + PORT);
  console.log('  Mode: TEST');
  console.log('  3 sample tasks loaded');
  console.log('  No OAuth needed');
  console.log('  No database needed');
  console.log('========================================');
  console.log('');
});
