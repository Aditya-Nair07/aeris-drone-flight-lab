@echo off
cd /d "%~dp0"
set "PATH=%CD%\.physics;%CD%\.physics\Library\bin;%PATH%"
".physics\python.exe" validate.py
echo.
echo Results are saved in the results folder.
pause
