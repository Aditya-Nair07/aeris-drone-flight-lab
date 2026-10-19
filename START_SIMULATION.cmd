@echo off
cd /d "%~dp0"
if not exist ".physics\python.exe" (
  echo Setting up the free simulation environment. Internet is needed for this first setup.
  powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1
  if errorlevel 1 goto fail
)
set "PATH=%CD%\.physics;%CD%\.physics\Library\bin;%PATH%"
".physics\python.exe" -c "import pybullet,numpy" >nul 2>&1
if errorlevel 1 goto fail
".physics\python.exe" -c "import urllib.request,json; assert 'position' in json.load(urllib.request.urlopen('http://127.0.0.1:8765/api/state',timeout=1))" >nul 2>&1
if not errorlevel 1 (
  start "" "http://127.0.0.1:8765"
  exit /b
)
echo Opening AERIS Drone Flight Lab. Keep this window open while using the simulation.
start "" "http://127.0.0.1:8765"
".physics\python.exe" server.py
pause
exit /b
:fail
echo Setup failed. See README.md for setup instructions.
pause
