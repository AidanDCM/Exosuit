@echo off
setlocal
if not exist "C:\Exosuit\Logs" mkdir "C:\Exosuit\Logs"
if exist "C:\Exosuit\Config\development-access.json" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Initialize-ExosuitDevelopmentAccess.ps1" -NoRestart >> "C:\Exosuit\Logs\setup-complete.log" 2>&1
  if errorlevel 1 exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& 'C:\Exosuit\Agent\Install-ExosuitFieldGuest.ps1' -Start -Confirm:$false" >> "C:\Exosuit\Logs\setup-complete.log" 2>&1
if errorlevel 1 exit /b 1
del /f /q "C:\Windows\Panther\Unattend.xml" >nul 2>&1
exit /b 0
