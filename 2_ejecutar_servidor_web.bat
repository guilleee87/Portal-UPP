@echo off
title Servidor Web Triaje - UPP Ciclo II
color 0a
cls
echo ===================================================================
echo     INICIANDO SERVIDOR WEB PARA EL SISTEMA DE TRIAJE (UPP)
echo ===================================================================
echo.
echo 1. Iniciando servidor en http://localhost:8000 ...
echo 2. Abriendo la aplicacion en tu navegador...
echo.

:: Asegurar ruta de Python
set "PATH=C:\Users\User\AppData\Local\Programs\Python\Python312;C:\Users\User\AppData\Local\Programs\Python\Python312\Scripts;%PATH%"

:: Abrir navegador tras 1 segundo
start "" http://localhost:8000

:: Ejecutar servidor Python
python server.py

pause
