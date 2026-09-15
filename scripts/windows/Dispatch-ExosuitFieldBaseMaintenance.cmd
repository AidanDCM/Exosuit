@echo off
rem Fixed one-use dispatch shim for Field base maintenance.
rem
rem The Service Control Manager creates this process directly, so its first
rem action records that the dispatch actually executed.
rem
rem Maintenance must NOT run as a child of this process. cmd is not a service
rem binary, so the SCM fails the start with 1053 after a 30 second timeout and
rem terminates the process it created, taking any descendants with it. Measured
rem on 9224fb8: the maintenance script reached components_verified at 02:10:43
rem and stopped dead, with the SCM logging its timeout at 02:10:49 and nothing
rem running afterwards. Sysprep alone needs minutes, so no amount of ordering
rem fits the remaining work inside that window.
rem
rem Creating the process through WMI parents it to the WMI provider host rather
rem than to this shim, so the SCM's kill cannot reach it. It still runs as
rem LocalSystem, which the maintenance script verifies independently, and the
rem command is fixed and reviewed.
rem
rem It takes no arguments and runs one fixed reviewed command.

set "EXOSUIT_LOGS=C:\Exosuit\Logs"
set "EXOSUIT_MARKER=%EXOSUIT_LOGS%\maintenance-dispatch.txt"
set "EXOSUIT_LOG=%EXOSUIT_LOGS%\maintenance-dispatch.log"
set "EXOSUIT_SPAWN=%EXOSUIT_LOGS%\maintenance-spawn.txt"

if not exist "%EXOSUIT_LOGS%" mkdir "%EXOSUIT_LOGS%"
echo dispatchedAtLocal=%DATE% %TIME%> "%EXOSUIT_MARKER%"
echo dispatchUser=%USERNAME%>> "%EXOSUIT_MARKER%"
echo dispatchSessionName=%SESSIONNAME%>> "%EXOSUIT_MARKER%"

C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$command = 'C:\Windows\System32\cmd.exe /c C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1 > \"%EXOSUIT_LOG%\" 2>&1'; $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command }; Set-Content -LiteralPath '%EXOSUIT_SPAWN%' -Value @(\"spawnReturnValue=$($r.ReturnValue)\", \"spawnProcessId=$($r.ProcessId)\") -Encoding ascii"

echo spawnRequestExitCode=%ERRORLEVEL% >> "%EXOSUIT_MARKER%"
echo completedAtLocal=%DATE% %TIME% >> "%EXOSUIT_MARKER%"
