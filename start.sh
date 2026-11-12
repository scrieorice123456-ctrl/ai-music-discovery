#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=================================================="
echo " Starting AI Music Discovery — Your Personal AI DJ "
echo "=================================================="

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required. Please install Python 3.11+ from https://www.python.org/"
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "Setting up Python virtual environment (one-time setup)..."
    python3 -m venv .venv
    echo "Installing backend dependencies..."
    .venv/bin/pip install --quiet -r backend/requirements.txt
fi

if [ ! -f ".env" ]; then
    cp .env.example .env
fi

echo ""
echo "Server is ready! Opening http://localhost:3000 in your browser..."
echo "Press Ctrl+C to stop the server."
echo ""

if command -v open &> /dev/null; then
    (sleep 1.5 && open "http://localhost:3000") &
elif command -v xdg-open &> /dev/null; then
    (sleep 1.5 && xdg-open "http://localhost:3000") &
fi

exec .venv/bin/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 3000
