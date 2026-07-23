@echo off
setlocal
if not exist "C:\Exosuit\Logs" mkdir "C:\Exosuit\Logs"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Install-ExosuitFieldGuest.ps1" -Confirm:$false >> "C:\Exosuit\Logs\setup-complete.log" 2>&1
exit /b %ERRORLEVEL%
