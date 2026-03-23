@echo off
set /p EXPO_PUBLIC=Open to public tunnel? (y/N): 

if /I "%EXPO_PUBLIC%"=="y" goto tunnel
if /I "%EXPO_PUBLIC%"=="yes" goto tunnel

echo Starting Expo on local/LAN mode...
npx expo start
goto :eof

:tunnel
echo Starting Expo on public tunnel mode...
npx expo start --tunnel
