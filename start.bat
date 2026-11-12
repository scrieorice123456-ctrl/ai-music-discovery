@echo off
setlocal
cd /d "%~dp0"

echo ==================================================
echo  Starting AI Music Discovery - Your Personal AI DJ 
echo ==================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Python 3 was not found.
    echo Please install Python 3.11+ from https://www.python.org/ and check "Add python.exe to PATH".
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Setting up Python virtual environment (one-time setup)...
    python -m venv .venv
    echo Installing backend dependencies...
    .venv\Scripts\pip install --quiet -r backend\requirements.txt
)

if not exist ".env" (
    copy .env.example .env >nul
)

echo.
echo Server is ready! Opening http://localhost:3000 in your browser...
echo Close this window when you want to stop the app.
echo.

start "" "http://localhost:3000"

.venv\Scripts\python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 3000
pause
