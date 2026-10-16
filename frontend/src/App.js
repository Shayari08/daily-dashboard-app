import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Archive from './pages/Archive';
import Onboarding from './pages/Onboarding';
import PrivateRoute from './components/PrivateRoute';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* "/" sends new users to onboarding, returning users to their dashboard, signed-out visitors to login */}
            <Route path="/" element={<PrivateRoute mode="app"><Navigate to="/dashboard" replace /></PrivateRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<PrivateRoute mode="onboarding"><Onboarding /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute mode="app"><Dashboard /></PrivateRoute>} />
            <Route path="/archive" element={<PrivateRoute mode="app"><Archive /></PrivateRoute>} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
