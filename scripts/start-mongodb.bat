@echo off
:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ====================================================
echo  Restoring valid mongod.cfg and starting MongoDB...
echo ====================================================

(
echo # mongod.conf
echo.
echo # for documentation of all options, see:
echo #   http://docs.mongodb.org/manual/reference/configuration-options/
echo.
echo # Where and how to store data.
echo storage:
echo   dbPath: C:\Program Files\MongoDB\Server\8.0\data
echo   wiredTiger:
echo     engineConfig:
echo       cacheSizeGB: 1
echo.
echo # where to write logging data.
echo systemLog:
echo   destination: file
echo   logAppend: true
echo   path:  C:\Program Files\MongoDB\Server\8.0\log\mongod.log
echo.
echo # network interfaces
echo net:
echo   port: 27017
echo   bindIp: 127.0.0.1
) > "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"

echo mongod.cfg has been corrected.
echo Starting MongoDB service...
net start MongoDB
echo.
sc query MongoDB
echo ====================================================
echo  MongoDB is running!
echo ====================================================
timeout /t 4
