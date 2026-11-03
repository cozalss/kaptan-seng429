@echo off
rem Cift tikla: guvenlik ilkesi ne olursa olsun kur.ps1 calisir.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kur.ps1" %*
pause
