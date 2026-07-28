@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Seal-ExosuitFieldBase.ps1" -Apply -TypedConfirmation "SEAL EXOSUIT FIELD BASE"
if errorlevel 1 (
  echo Exosuit Field base sealing failed.
  pause
  exit /b 1
)
