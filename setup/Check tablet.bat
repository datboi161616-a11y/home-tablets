@echo off
rem Double-click to look over a tablet plugged in over USB. Nothing on it is changed.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-tablet.ps1" -Check
