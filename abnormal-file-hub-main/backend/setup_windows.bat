@echo off
echo Setting up Python virtual environment...

:: Check if venv exists and remove it if it does
if exist venv (
    echo Removing existing virtual environment...
    rmdir /s /q venv
)

:: Create and activate virtual environment
echo Creating new virtual environment...
python -m venv venv
if errorlevel 1 (
    echo Failed to create virtual environment
    pause
    exit /b 1
)

:: Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate
if errorlevel 1 (
    echo Failed to activate virtual environment
    pause
    exit /b 1
)

:: Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo Failed to upgrade pip
    pause
    exit /b 1
)

:: Install wheel first
echo Installing wheel...
pip install wheel
if errorlevel 1 (
    echo Failed to install wheel
    pause
    exit /b 1
)

:: Install requirements with verbose output
echo Installing requirements...
pip install -v -r requirements.txt
if errorlevel 1 (
    echo Failed to install requirements
    pause
    exit /b 1
)

:: Verify django-filter installation
echo Verifying django-filter installation...
python -c "import django_filters" 2>nul
if errorlevel 1 (
    echo Attempting to install django-filter directly...
    pip install django-filter==23.3
)

echo.
echo Setup complete! You can now run the development server with:
echo python manage.py runserver
echo.
echo If you encounter any issues, try running:
echo pip install django-filter==23.3
echo.
pause 