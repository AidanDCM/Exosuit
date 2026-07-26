@echo off
rem Fixed one-use dispatch shim for Field base maintenance.
rem
rem The Service Control Manager creates this process directly, so its first
rem action records that the dispatch actually executed. Across earlier attempts
rem the maintenance script never wrote its own first stage marker, and there was
rem no way to tell whether the SYSTEM process failed instantly or was never
rem created at all. This marker settles that without inference.
rem
rem It takes no arguments and runs one fixed reviewed command.

set "EXOSUIT_LOGS=C:\Exosuit\Logs"
set "EXOSUIT_MARKER=%EXOSUIT_LOGS%\maintenance-dispatch.txt"
set "EXOSUIT_LOG=%EXOSUIT_LOGS%\maintenance-dispatch.log"

if not exist "%EXOSUIT_LOGS%" mkdir "%EXOSUIT_LOGS%"
echo dispatchedAtLocal=%DATE% %TIME%> "%EXOSUIT_MARKER%"
echo dispatchUser=%USERNAME%>> "%EXOSUIT_MARKER%"
echo dispatchSessionName=%SESSIONNAME%>> "%EXOSUIT_MARKER%"

C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1 > "%EXOSUIT_LOG%" 2>&1
rem A space before the redirect is required: with a numeric ERRORLEVEL, the
rem sequence %%ERRORLEVEL%%>> parses as a "1>>" stdout redirect and swallows the
rem value, which is exactly what happened on the first instrumented attempt.
echo maintenanceExitCode=%ERRORLEVEL% >> "%EXOSUIT_MARKER%"
echo completedAtLocal=%DATE% %TIME% >> "%EXOSUIT_MARKER%"
