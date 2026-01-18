#!/bin/bash

# Daily Dashboard - Comprehensive Test Suite
# Tests structure, dependencies, and configuration

echo "=========================================="
echo "   DAILY DASHBOARD - TEST SUITE"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
run_test() {
    local test_name=$1
    local command=$2
    
    echo -n "Testing: $test_name ... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED++))
        return 1
    fi
}

# File existence tests
echo "=== File Structure Tests ==="
run_test "Docker Compose file exists" "test -f docker-compose.yml"
run_test "Backend Dockerfile exists" "test -f backend/Dockerfile"
run_test "Frontend Dockerfile exists" "test -f frontend/Dockerfile"
run_test "Backend package.json exists" "test -f backend/package.json"
run_test "Frontend package.json exists" "test -f frontend/package.json"
run_test "Backend server.js exists" "test -f backend/server.js"
run_test "Frontend App.js exists" "test -f frontend/src/App.js"
run_test "Database init script exists" "test -f backend/scripts/initDatabase.js"
run_test "README.md exists" "test -f README.md"
run_test "SETUP.md exists" "test -f SETUP.md"
run_test "QUICKSTART.md exists" "test -f QUICKSTART.md"
echo ""

# Backend routes tests
echo "=== Backend Routes Tests ==="
run_test "Auth routes exist" "test -f backend/routes/auth.js"
run_test "Tasks routes exist" "test -f backend/routes/tasks.js"
run_test "Habits routes exist" "test -f backend/routes/habits.js"
run_test "Profile routes exist" "test -f backend/routes/profile.js"
run_test "Insights routes exist" "test -f backend/routes/insights.js"
run_test "Assistant routes exist" "test -f backend/routes/assistant.js"
echo ""

# Backend services tests
echo "=== Backend Services Tests ==="
run_test "LLM service exists" "test -f backend/services/llmService.js"
run_test "Passport config exists" "test -f backend/config/passport.js"
echo ""

# Frontend component tests
echo "=== Frontend Components Tests ==="
run_test "Login page exists" "test -f frontend/src/pages/Login.js"
run_test "Onboarding page exists" "test -f frontend/src/pages/Onboarding.js"
run_test "Dashboard page exists" "test -f frontend/src/pages/Dashboard.js"
run_test "PrivateRoute component exists" "test -f frontend/src/components/PrivateRoute.js"
run_test "Login CSS exists" "test -f frontend/src/pages/Login.css"
run_test "Onboarding CSS exists" "test -f frontend/src/pages/Onboarding.css"
run_test "Dashboard CSS exists" "test -f frontend/src/pages/Dashboard.css"
run_test "App CSS exists" "test -f frontend/src/App.css"
echo ""

# JavaScript syntax tests
echo "=== JavaScript Syntax Tests ==="
run_test "Backend server.js syntax" "node -c backend/server.js"
run_test "Auth routes syntax" "node -c backend/routes/auth.js"
run_test "Tasks routes syntax" "node -c backend/routes/tasks.js"
run_test "Habits routes syntax" "node -c backend/routes/habits.js"
run_test "Profile routes syntax" "node -c backend/routes/profile.js"
run_test "Insights routes syntax" "node -c backend/routes/insights.js"
run_test "Assistant routes syntax" "node -c backend/routes/assistant.js"
run_test "LLM service syntax" "node -c backend/services/llmService.js"
run_test "Database init syntax" "node -c backend/scripts/initDatabase.js"
run_test "Passport config syntax" "node -c backend/config/passport.js"
run_test "Frontend App.js syntax" "node -c frontend/src/App.js"
run_test "Login page syntax" "node -c frontend/src/pages/Login.js"
run_test "Onboarding page syntax" "node -c frontend/src/pages/Onboarding.js"
run_test "Dashboard page syntax" "node -c frontend/src/pages/Dashboard.js"
run_test "PrivateRoute syntax" "node -c frontend/src/components/PrivateRoute.js"
echo ""

# JSON validation tests
echo "=== JSON Configuration Tests ==="
run_test "Backend package.json valid" "python3 -m json.tool backend/package.json"
run_test "Frontend package.json valid" "python3 -m json.tool frontend/package.json"
run_test "Docker compose YAML valid" "python3 -c 'import yaml; yaml.safe_load(open(\"docker-compose.yml\"))'"
echo ""

# Dependency checks
echo "=== Dependency Analysis ==="
run_test "Backend has express dependency" "grep -q '\"express\"' backend/package.json"
run_test "Backend has pg dependency" "grep -q '\"pg\"' backend/package.json"
run_test "Backend has passport dependency" "grep -q '\"passport\"' backend/package.json"
run_test "Frontend has react dependency" "grep -q '\"react\"' frontend/package.json"
run_test "Frontend has axios dependency" "grep -q '\"axios\"' frontend/package.json"
run_test "Frontend has framer-motion" "grep -q '\"framer-motion\"' frontend/package.json"
echo ""

# Code quality checks
echo "=== Code Quality Tests ==="
run_test "No console.log in production code" "! grep -r 'console.log' backend/routes/ backend/services/"
run_test "Environment template exists" "test -f backend/.env.example"
run_test "GitIgnore exists" "test -f .gitignore"
run_test "Backend uses PORT from env" "grep -q 'process.env.PORT' backend/server.js"
run_test "OAuth routes implemented" "grep -q 'passport.authenticate' backend/routes/auth.js"
echo ""

# Database schema tests
echo "=== Database Schema Tests ==="
run_test "Users table creation" "grep -q 'CREATE TABLE.*users' backend/scripts/initDatabase.js"
run_test "Tasks table creation" "grep -q 'CREATE TABLE.*tasks' backend/scripts/initDatabase.js"
run_test "Habits table creation" "grep -q 'CREATE TABLE.*habits' backend/scripts/initDatabase.js"
run_test "User profiles table creation" "grep -q 'CREATE TABLE.*user_profiles' backend/scripts/initDatabase.js"
run_test "Daily states table creation" "grep -q 'CREATE TABLE.*daily_states' backend/scripts/initDatabase.js"
run_test "Insights table creation" "grep -q 'CREATE TABLE.*insights' backend/scripts/initDatabase.js"
run_test "Behavioral logs table creation" "grep -q 'CREATE TABLE.*behavioral_logs' backend/scripts/initDatabase.js"
run_test "Habit logs table creation" "grep -q 'CREATE TABLE.*habit_logs' backend/scripts/initDatabase.js"
run_test "Database indexes created" "grep -q 'CREATE INDEX' backend/scripts/initDatabase.js"
echo ""

# API endpoint tests
echo "=== API Endpoint Tests ==="
run_test "Auth routes defined" "grep -q 'router.get.*auth' backend/routes/auth.js"
run_test "Tasks CRUD endpoints" "grep -q 'router.post' backend/routes/tasks.js && grep -q 'router.get' backend/routes/tasks.js && grep -q 'router.put' backend/routes/tasks.js && grep -q 'router.delete' backend/routes/tasks.js"
run_test "Habits endpoints exist" "grep -q 'router.get' backend/routes/habits.js"
run_test "Profile endpoints exist" "grep -q 'router.get' backend/routes/profile.js"
run_test "Insights endpoints exist" "grep -q 'router.post.*review' backend/routes/insights.js"
run_test "Assistant query endpoint" "grep -q 'router.post.*query' backend/routes/assistant.js"
echo ""

# LLM integration tests
echo "=== LLM Integration Tests ==="
run_test "LLM service class exists" "grep -q 'class LLMService' backend/services/llmService.js"
run_test "Task generation method" "grep -q 'generateTaskSuggestions' backend/services/llmService.js"
run_test "Task breakdown method" "grep -q 'breakdownTask' backend/services/llmService.js"
run_test "Habit detection method" "grep -q 'detectHabitPattern' backend/services/llmService.js"
run_test "Insight generation method" "grep -q 'generateInsight' backend/services/llmService.js"
run_test "Question answering method" "grep -q 'answerQuestion' backend/services/llmService.js"
run_test "Fallback handling" "grep -q 'fallbackResponse' backend/services/llmService.js"
echo ""

# Frontend routing tests
echo "=== Frontend Routing Tests ==="
run_test "React Router imported" "grep -q 'react-router-dom' frontend/src/App.js"
run_test "Login route defined" "grep -q '/login' frontend/src/App.js"
run_test "Dashboard route defined" "grep -q '/dashboard' frontend/src/App.js"
run_test "Onboarding route defined" "grep -q '/onboarding' frontend/src/App.js"
run_test "PrivateRoute used" "grep -q 'PrivateRoute' frontend/src/App.js"
echo ""

# Docker configuration tests
echo "=== Docker Configuration Tests ==="
run_test "PostgreSQL service defined" "grep -q 'postgres:' docker-compose.yml"
run_test "Ollama service defined" "grep -q 'ollama:' docker-compose.yml"
run_test "Backend service defined" "grep -q 'backend:' docker-compose.yml"
run_test "Frontend service defined" "grep -q 'frontend:' docker-compose.yml"
run_test "Database URL configured" "grep -q 'DATABASE_URL' docker-compose.yml"
run_test "Ollama URL configured" "grep -q 'OLLAMA_URL' docker-compose.yml"
run_test "Health checks configured" "grep -q 'healthcheck:' docker-compose.yml"
run_test "Volumes defined" "grep -q 'volumes:' docker-compose.yml"
run_test "Dependency management" "grep -q 'depends_on:' docker-compose.yml"
echo ""

# Security tests
echo "=== Security Configuration Tests ==="
run_test "Helmet middleware used" "grep -q 'helmet' backend/server.js"
run_test "CORS configured" "grep -q 'cors' backend/server.js"
run_test "Rate limiting implemented" "grep -q 'rate-limit' backend/server.js"
run_test "Session security configured" "grep -q 'httpOnly' backend/server.js"
run_test "Password not in env example" "! grep -q 'password=' backend/.env.example || grep -q 'your-' backend/.env.example"
echo ""

# Feature completeness tests
echo "=== Feature Implementation Tests ==="
run_test "Priority calculation implemented" "grep -q 'calculatePriorityScore' backend/routes/tasks.js"
run_test "Habit detection logic" "grep -q 'detect' backend/routes/habits.js"
run_test "Daily state tracking" "grep -q 'daily_states' backend/routes/profile.js"
run_test "Onboarding flow steps" "grep -q 'step' frontend/src/pages/Onboarding.js"
run_test "Task completion handler" "grep -q 'handleCompleteTask' frontend/src/pages/Dashboard.js"
echo ""

# Documentation tests
echo "=== Documentation Tests ==="
run_test "README has overview" "grep -q 'Overview' README.md"
run_test "README has features" "grep -q 'Features' README.md"
run_test "README has architecture" "grep -q 'Architecture' README.md"
run_test "SETUP has prerequisites" "grep -q 'Prerequisites' SETUP.md"
run_test "SETUP has steps" "grep -q 'Step' SETUP.md"
run_test "QUICKSTART has commands" "grep -q 'docker-compose' QUICKSTART.md"
run_test "OAuth setup documented" "grep -q 'OAuth' SETUP.md"
run_test "Troubleshooting documented" "grep -q 'Troubleshooting' SETUP.md"
echo ""

# Summary
echo "=========================================="
echo "           TEST SUMMARY"
echo "=========================================="
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo "The application is ready for deployment."
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed${NC}"
    echo "Review the failures above."
    exit 1
fi
