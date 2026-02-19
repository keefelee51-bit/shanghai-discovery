@echo off
:: ============================================================================
:: run-cookie-refresh.bat
:: ============================================================================
::
:: WHAT THIS FILE DOES
:: -------------------
:: This is a Windows Batch file — a list of commands that Windows runs
:: in sequence, like a recipe. Double-clicking it runs all the commands.
::
:: This file does TWO things:
::   1. Runs auto-refresh-cookies.py (refreshes XHS cookies + updates GitHub)
::   2. Registers itself as a daily Windows Task Scheduler task
::
:: FIRST RUN: Double-click this file to set up the scheduled task.
:: After that, Windows Task Scheduler runs it automatically every day at 9AM.
::
:: HOW TO USE
:: ----------
:: Before running, make sure you've set these environment variables:
::
::   Open PowerShell and paste (replace with your actual values):
::
::     [System.Environment]::SetEnvironmentVariable("GITHUB_PAT",   "ghp_yourtoken", "User")
::     [System.Environment]::SetEnvironmentVariable("GITHUB_OWNER", "yourusername",   "User")
::     [System.Environment]::SetEnvironmentVariable("GITHUB_REPO",  "shanghai-discovery", "User")
::
::   These are saved permanently (User level) — they survive reboots.
::   You only need to do this once.
::
:: THEN: Double-click this .bat file
:: ============================================================================

:: Change directory to the folder where this script lives (the scraper/ folder).
:: %~dp0 is a Windows special variable meaning "the directory of this batch file".
:: Without this, the script might run from the wrong folder and not find browser_data/.
cd /d "%~dp0"

echo ============================================================
echo   XHS Cookie Auto-Refresher
echo ============================================================
echo.

:: ── Option A: Run it RIGHT NOW (for testing) ─────────────────────────────
::
:: If you want to test the script immediately, uncomment the next line
:: (remove the "::" prefix) and comment out the Task Scheduler section below.
::
:: python auto-refresh-cookies.py
:: goto :end

:: ── Option B: Register as a daily Task Scheduler job ─────────────────────
::
:: schtasks = Windows command to manage scheduled tasks
:: /Create  = create a new task
:: /TN      = Task Name (shown in Task Scheduler app)
:: /TR      = Task Run = what command to execute
:: /SC      = Schedule type (DAILY = run every day)
:: /ST      = Start Time in HH:MM (09:00 = 9:00 AM)
:: /F       = Force overwrite if the task already exists
::
:: WHY 9:00 AM?
:: GitHub Actions runs at 2AM UTC = 10AM Shanghai time.
:: We run this at 9AM Shanghai (1AM UTC) — one hour before GHA.
:: That gives us a buffer in case this script is slow.

echo Registering daily Task Scheduler job (runs at 9:00 AM Shanghai time)...
echo.

:: %~f0 = full path to THIS batch file (used so the task knows where to run from)
schtasks /Create ^
  /TN "XHS Cookie Auto-Refresh" ^
  /TR "\"%~f0\"" ^
  /SC DAILY ^
  /ST 09:00 ^
  /F

if %ERRORLEVEL% == 0 (
    echo.
    echo ✓ Scheduled task created successfully!
    echo.
    echo   Task name: "XHS Cookie Auto-Refresh"
    echo   Runs at:   9:00 AM every day (Shanghai time)
    echo.
    echo   To verify: Open Task Scheduler app and look for "XHS Cookie Auto-Refresh"
    echo   To edit:   Right-click the task → Properties
    echo   To delete: schtasks /Delete /TN "XHS Cookie Auto-Refresh" /F
    echo.
) else (
    echo.
    echo ✗ Failed to create scheduled task.
    echo   Try running this file as Administrator (right-click → Run as administrator)
    echo.
)

:: ── Run it once right now so you can verify it works ──────────────────────
echo Running cookie refresh now (first test)...
echo.
python auto-refresh-cookies.py

:end
echo.
echo Done.
pause
