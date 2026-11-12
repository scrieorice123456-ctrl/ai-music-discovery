@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =======================================================
echo   AI MUSIC DISCOVERY — YOUR PERSONAL AI DJ
echo =======================================================
echo.

:: Detect Python command
set "PYTHON_EXE="
where python >nul 2>nul && set "PYTHON_EXE=python"
if not defined PYTHON_EXE (
    where py >nul 2>nul && set "PYTHON_EXE=py"
)
if not defined PYTHON_EXE (
    where python3 >nul 2>nul && set "PYTHON_EXE=python3"
)

if not defined PYTHON_EXE (
    echo [X] Python was not found on your computer!
    echo.
    echo To run this program, you need Python installed:
    echo   1. Go to: https://www.python.org/downloads/
    echo   2. Download and run the installer.
    echo   3. IMPORTANT: Check the box that says:
    echo      "[x] Add python.exe to PATH"
    echo   4. After installing, double-click this start.bat file again!
    echo.
    echo Press any key to open the Python download page...
    pause >nul
    start "" "https://www.python.org/downloads/"
    exit /b 1
)

echo [*] Found Python: %PYTHON_EXE%

:: Create virtual environment if missing
if not exist ".venv\Scripts\python.exe" (
    echo [*] Setting up local environment (one-time setup, takes ~15 seconds)...
    "%PYTHON_EXE%" -m venv .venv
    if errorlevel 1 (
        echo [X] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [*] Installing backend libraries...
    ".venv\Scripts\pip.exe" install --quiet -r backend\requirements.txt
    if errorlevel 1 (
        echo [X] Failed to install requirements.
        pause
        exit /b 1
    )
)

:: Create default .env if missing
if not exist ".env" (
    copy .env.example .env >nul
)

echo.
echo =======================================================
echo   App is starting! Opening http://localhost:3000 ...
echo =======================================================
echo (Keep this black window open while using the app)
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 3000
pause
