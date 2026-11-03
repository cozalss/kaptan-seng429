@echo off
rem Cift tikla: guvenlik ilkesi ne olursa olsun baslat.ps1 calisir.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0baslat.ps1" %*
pause
