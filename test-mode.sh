#!/bin/bash

# Daily Dashboard - INSTANT TEST MODE
# Runs everything with mock data - NO setup needed!

echo "=============================================="
echo "  🚀 Daily Dashboard - INSTANT TEST MODE"
echo "=============================================="
echo ""
echo "This will run the app with:"
echo "  ✓ Mock authentication (no OAuth needed)"
echo "  ✓ In-memory database (no PostgreSQL needed)"
echo "  ✓ Mock LLM (no Ollama needed)"
echo ""
echo "Perfect for quick testing!"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Kill any existing processes
cleanup() {
    echo ""
    echo "Cleaning up..."
    pkill -f "node.*backend" 2>/dev/null
    pkill -f "react-scripts start" 2>/dev/null
}

trap cleanup EXIT

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js required. Install from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"
echo ""

# Backend setup
echo "Setting up backend..."
cd backend
npm install --silent 2>/dev/null

echo ""
echo "Starting backend in test mode..."
cat > server-test.js << 'EOF'
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

// Mock tasks storage
let tasks = [
  {
    id: '1',
    user_id: mockUser.id,
    title: 'Try drag and drop',
    description: 'Grab the handle and drag me around!',
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
    description: 'Use the Add Task button to create a new task',
    energy_required: 1,
    status: 'pending',
    created_by: 'manual',
    priority_score: 50,
    created_at: new Date().toISOString()
  }
];

// Auth endpoints
app.get('/api/auth/me', (req, res) => {
  res.json({ user: mockUser });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: tasks.filter(t => t.status === 'pending') });
});

app.post('/api/tasks', (req, res) => {
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
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body);
    res.json(task);
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter(t => t.id !== req.params.id);
  res.json({ message: 'Task deleted' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'test',
    message: 'Running in test mode with mock data'
  });
});

// Metrics (mock)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Test mode - metrics disabled\n');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`📝 Test mode with mock data`);
  console.log(`✓ No OAuth needed`);
  console.log(`✓ No database needed`);
  console.log(`✓ No LLM needed`);
});
EOF

# Start backend
node server-test.js &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

cd ..

# Wait for backend
sleep 2

# Frontend setup
echo ""
echo "Setting up frontend..."
cd frontend
npm install --silent 2>/dev/null

# Update frontend to skip login in test mode
echo ""
echo "Configuring frontend for test mode..."

# Create test version of App.js that skips login
cat > src/App-test.js << 'EOF'
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import './App.css';

function App() {
  // Test mode - skip login, go straight to dashboard
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
EOF

# Backup original and use test version
mv src/App.js src/App-original.js 2>/dev/null
mv src/App-test.js src/App.js

echo -e "${GREEN}✓ Frontend configured${NC}"

echo ""
echo "Starting frontend..."
BROWSER=none npm start &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend starting (PID: $FRONTEND_PID)${NC}"

cd ..

# Wait for frontend to compile
echo ""
echo "Waiting for app to start..."
sleep 8

echo ""
echo "=============================================="
echo "  🎉 APP IS RUNNING!"
echo "=============================================="
echo ""
echo "📱 Open in browser:"
echo "   → http://localhost:3000"
echo ""
echo "✨ Features to test:"
echo "   ✓ Drag and drop tasks (grab the ⋮⋮ handle)"
echo "   ✓ Add new tasks"
echo "   ✓ Complete tasks"
echo "   ✓ View metrics at http://localhost:5000/metrics"
echo ""
echo "💡 Test mode features:"
echo "   • No login required"
echo "   • 3 sample tasks loaded"
echo "   • Changes saved in memory"
echo "   • Restart to reset data"
echo ""
echo "🛑 To stop:"
echo "   Press Ctrl+C"
echo ""
echo "=============================================="
echo ""

# Keep running
wait
EOF

chmod +x quick-start.sh
