@echo off
setlocal
cd /d "%~dp0"
title Sistema de Prioridad de Atencion - CMD (UPP)
color 0b
cls
echo ===================================================================
echo   SISTEMA DE TRIAJE HOSPITALARIO (CASO 6)
echo   Universidad Politecnica del Peru (UPP)
echo   Facultad de Ciencias de la Salud - Enfermeria
echo   Autores: Luis Guillermo Vasquez Valdivieso
echo            Rodrigo Alonso Anazgo Farro
echo ===================================================================
echo.

:: 1. Comprobar comando python en PATH del sistema
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python triage_prioridad.py
    goto FIN
)

:: 2. Comprobar lanzador py de Windows
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py triage_prioridad.py
    goto FIN
)

:: 3. Comprobar ruta directa en LOCALAPPDATA
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" triage_prioridad.py
    goto FIN
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" triage_prioridad.py
    goto FIN
)

if exist "C:\Python312\python.exe" (
    "C:\Python312\python.exe" triage_prioridad.py
    goto FIN
)

if exist "C:\Python311\python.exe" (
    "C:\Python311\python.exe" triage_prioridad.py
    goto FIN
)

:: 4. Si no se detecta Python en la computadora
color 0c
echo [AVISO] Esta computadora no tiene Python instalado en el sistema.
echo.
echo No te preocupes, puedes mostrar la version interactiva completa:
echo Abre la carpeta y haz doble clic en index.html
echo (Funciona al instante en cualquier navegador sin necesidad de Python ni internet).
echo.

:FIN
echo.
echo ===================================================================
echo   Presione cualquier tecla para cerrar esta ventana...
echo ===================================================================
pause > nul
