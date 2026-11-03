@echo off
rem Cift tikla: guvenlik ilkesi ne olursa olsun durdur.ps1 calisir.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0durdur.ps1" %*
pause
