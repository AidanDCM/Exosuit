@echo off
setlocal
if not exist "C:\Exosuit\Logs" mkdir "C:\Exosuit\Logs"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& 'C:\Exosuit\Agent\Install-ExosuitFieldGuest.ps1' -Confirm:$false" >> "C:\Exosuit\Logs\setup-complete.log" 2>&1
del /f /q "C:\Windows\Panther\Unattend.xml" >nul 2>&1
exit /b %ERRORLEVEL%
