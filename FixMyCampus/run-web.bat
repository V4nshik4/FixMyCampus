@echo off
if not exist out mkdir out
javac -d out Main.java WebServer.java
if errorlevel 1 pause & exit /b 1
java -cp out WebServer
pause