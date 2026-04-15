#!/bin/bash
set -e

echo "=== Ads Management Platform Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit it with your credentials."
else
    echo ".env already exists, skipping."
fi

# Start Postgres
echo "Starting Postgres..."
docker compose up postgres -d

# Wait for Postgres to be healthy
echo "Waiting for Postgres..."
until docker compose exec postgres pg_isready -U ads_user -d ads_dashboard >/dev/null 2>&1; do
    sleep 1
done
echo "Postgres is ready."

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend && npm install && cd ..

# Run migrations
echo "Running migrations..."
cd backend && npx knex migrate:latest && cd ..

# Run seeds
echo "Running seeds..."
cd backend && npx knex seed:run && cd ..

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend && npm install && cd ..

echo ""
echo "=== Setup Complete ==="
echo "Start backend:  cd backend && npm run dev"
echo "Start frontend: cd frontend && npm run dev"
echo "Or run all:     docker compose up"
