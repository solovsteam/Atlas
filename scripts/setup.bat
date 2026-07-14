@echo off
REM First-time setup after cloning the repo (Windows).
cd /d "%~dp0\.."

echo Atlas setup
echo ===========

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required ^(20+^). Install from https://nodejs.org/
  exit /b 1
)

echo Installing dependencies...
call npm install

if not exist .env.local (
  copy .env.example .env.local
  echo.
  echo Created .env.local — add your Supabase URL and anon key before running the app.
  echo See README.md
) else (
  echo .env.local already exists ^(unchanged^).
)

echo.
echo Setup done.
echo.
echo Next: npm run dev
echo Then open http://localhost:5173 in your browser.
