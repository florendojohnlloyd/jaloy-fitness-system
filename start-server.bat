@echo off
title Fitness Exclusive - Central Server
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download it from https://nodejs.org ^(version 22.13 or newer^) & pause & exit /b)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/login.html"
node server\server.js
pause
