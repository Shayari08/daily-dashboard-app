@echo off
REM Daily Dashboard - INSTANT TEST MODE (Windows)

echo ==============================================
echo   Daily Dashboard - INSTANT TEST MODE
echo ==============================================
echo.
echo This will run the app with:
echo   - Mock authentication (no OAuth needed)
echo   - In-memory database (no PostgreSQL needed)
echo   - Mock LLM (no Ollama needed)
echo.
echo Perfect for quick testing!
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo X Node.js required. Install from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js found
echo.

REM Setup backend
echo Setting up backend...
cd backend
call npm install --silent

echo.
echo Starting backend in test mode...

REM Create test server file
(
echo const express = require('express'^);
echo const cors = require('cors'^);
echo const app = express(^);
echo.
echo app.use(cors(^)^);
echo app.use(express.json(^)^);
echo.
echo const mockUser = { id: 'test-123', name: 'Test User', email: 'test@example.com' };
echo let tasks = [
echo   { id: '1', user_id: mockUser.id, title: 'Try drag and drop', description: 'Grab the handle and drag!', energy_required: 3, status: 'pending', created_by: 'manual', priority_score: 75 },
echo   { id: '2', user_id: mockUser.id, title: 'Test completion', description: 'Click Complete button', energy_required: 2, status: 'pending', created_by: 'ai', priority_score: 60 },
echo   { id: '3', user_id: mockUser.id, title: 'Add your own task', description: 'Use Add Task button', energy_required: 1, status: 'pending', created_by: 'manual', priority_score: 50 }
echo ];
echo.
echo app.get('/api/auth/me', (req, res^) =^> res.json({ user: mockUser }^)^);
echo app.post('/api/auth/logout', (req, res^) =^> res.json({ message: 'Logged out' }^)^);
echo app.get('/api/tasks', (req, res^) =^> res.json({ tasks: tasks.filter(t =^> t.status === 'pending'^) }^)^);
echo app.post('/api/tasks', (req, res^) =^> {
echo   const newTask = { id: Date.now(^).toString(^), user_id: mockUser.id, ...req.body, status: 'pending', created_by: 'manual', priority_score: 50 };
echo   tasks.push(newTask^);
echo   res.status(201^).json(newTask^);
echo }^);
echo app.put('/api/tasks/:id', (req, res^) =^> {
echo   const task = tasks.find(t =^> t.id === req.params.id^);
echo   if (task^) { Object.assign(task, req.body^); res.json(task^); } else { res.status(404^).json({ error: 'Not found' }^); }
echo }^);
echo app.delete('/api/tasks/:id', (req, res^) =^> { tasks = tasks.filter(t =^> t.id !== req.params.id^); res.json({ message: 'Deleted' }^); }^);
echo app.get('/health', (req, res^) =^> res.json({ status: 'ok', mode: 'test' }^)^);
echo app.get('/metrics', (req, res^) =^> { res.set('Content-Type', 'text/plain'^); res.send('# Test mode\n'^); }^);
echo.
echo const PORT = 5000;
echo app.listen(PORT, (^) =^> console.log(`Backend running on http://localhost:${PORT}`^)^);
) > server-test.js

REM Start backend
start "Backend" cmd /k node server-test.js
echo ✓ Backend started
timeout /t 2 /nobreak >nul

cd ..

REM Setup frontend
echo.
echo Setting up frontend...
cd frontend
call npm install --silent

echo.
echo Configuring frontend for test mode...

REM Create test App.js
(
echo import React from 'react';
echo import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
echo import Dashboard from './pages/Dashboard';
echo import './App.css';
echo.
echo function App(^) {
echo   return (
echo     ^<Router^>
echo       ^<Routes^>
echo         ^<Route path="/" element={^<Navigate to="/dashboard" replace /^>} /^>
echo         ^<Route path="/dashboard" element={^<Dashboard /^>} /^>
echo         ^<Route path="*" element={^<Navigate to="/dashboard" replace /^>} /^>
echo       ^</Routes^>
echo     ^</Router^>
echo   ^);
echo }
echo.
echo export default App;
) > src\App-test.js

REM Backup and replace
if exist src\App.js ren src\App.js App-original.js
ren src\App-test.js App.js

echo ✓ Frontend configured
echo.
echo Starting frontend...

REM Start frontend
start "Frontend" cmd /k "set BROWSER=none && npm start"
echo ✓ Frontend starting

cd ..

echo.
echo Waiting for app to start...
timeout /t 8 /nobreak >nul

echo.
echo ==============================================
echo   APP IS RUNNING!
echo ==============================================
echo.
echo Open in browser:
echo   http://localhost:3000
echo.
echo Features to test:
echo   ✓ Drag and drop tasks (grab the handle)
echo   ✓ Add new tasks
echo   ✓ Complete tasks
echo   ✓ View metrics
echo.
echo Test mode features:
echo   • No login required
echo   • 3 sample tasks loaded
echo   • Changes saved in memory
echo.
echo To stop: Close the terminal windows
echo.
echo ==============================================
echo.

pause
