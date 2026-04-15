#!/bin/bash
set -e

echo "=== Reset Database ==="
echo "This will drop all tables and recreate them."
read -p "Are you sure? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
fi

cd "$(dirname "$0")/../backend"

echo "Rolling back all migrations..."
npx knex migrate:rollback --all

echo "Running migrations..."
npx knex migrate:latest

echo "Running seeds..."
npx knex seed:run

echo "=== Database Reset Complete ==="
