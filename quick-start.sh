#!/bin/bash

# Daily Dashboard - Quick Local Test
# This script sets up and runs the app locally in 5 minutes

echo "=============================================="
echo "  Daily Dashboard - Quick Local Setup"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install from https://nodejs.org/${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Check PostgreSQL
echo "Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL not found.${NC}"
    echo "Install from: https://www.postgresql.org/download/"
    echo "Or use Docker: docker run -p 5432:5432 -e POSTGRES_PASSWORD=password -d postgres:15"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL found${NC}"

echo ""
echo "=============================================="
echo "  Step 1: Setup Database"
echo "=============================================="

# Create database
echo "Creating database..."
createdb daily_dashboard 2>/dev/null || echo "Database may already exist"

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw daily_dashboard; then
    echo -e "${GREEN}✓ Database 'daily_dashboard' ready${NC}"
else
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi

echo ""
echo "=============================================="
echo "  Step 2: Setup Backend"
echo "=============================================="

cd backend

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    
    # Update DATABASE_URL
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:password@localhost:5432/daily_dashboard|' .env
    else
        sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:password@localhost:5432/daily_dashboard|' .env
    fi
    
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠ Note: Update OAuth credentials in backend/.env for login to work${NC}"
fi

# Install dependencies
echo "Installing backend dependencies..."
npm install --silent

# Initialize database
echo "Setting up database tables..."
node scripts/initDatabase.js

echo -e "${GREEN}✓ Backend setup complete${NC}"

cd ..

echo ""
echo "=============================================="
echo "  Step 3: Setup Frontend"
echo "=============================================="

cd frontend

# Install dependencies
echo "Installing frontend dependencies..."
npm install --silent

echo -e "${GREEN}✓ Frontend setup complete${NC}"

cd ..

echo ""
echo "=============================================="
echo "  Setup Complete!"
echo "=============================================="
echo ""
echo -e "${GREEN}✅ All dependencies installed${NC}"
echo -e "${GREEN}✅ Database initialized${NC}"
echo -e "${GREEN}✅ Ready to run!${NC}"
echo ""
echo "=============================================="
echo "  Next Steps:"
echo "=============================================="
echo ""
echo "1. Start Backend (Terminal 1):"
echo "   cd backend && npm start"
echo ""
echo "2. Start Frontend (Terminal 2):"
echo "   cd frontend && npm start"
echo ""
echo "3. Open Browser:"
echo "   http://localhost:3000"
echo ""
echo "=============================================="
echo "  Optional: Add OAuth Credentials"
echo "=============================================="
echo ""
echo "To enable login, edit backend/.env:"
echo ""
echo "GitHub OAuth (5 min):"
echo "  1. https://github.com/settings/developers"
echo "  2. New OAuth App"
echo "  3. Callback: http://localhost:5000/api/auth/github/callback"
echo "  4. Copy Client ID/Secret to .env"
echo ""
echo "Google OAuth (10 min):"
echo "  1. https://console.cloud.google.com/"
echo "  2. Create OAuth credentials"
echo "  3. Callback: http://localhost:5000/api/auth/google/callback"
echo "  4. Copy Client ID/Secret to .env"
echo ""
echo "=============================================="
echo ""
