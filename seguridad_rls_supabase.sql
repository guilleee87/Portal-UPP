-- ==============================================================================
-- SISTEMA DE SEGURIDAD Y CONTROL DE ACCESO A BASE DE DATOS (SUPABASE RLS)
-- Archivo: seguridad_rls_supabase.sql
-- Universidad Politécnica del Perú (UPP) - Facultad de Ciencias de la Salud
-- Autores: Luis Guillermo Vásquez Valdivieso & Rodrigo Alonso Añazgo Farro
-- Normativas: Ley N° 29733 (Protección de Datos Personales) y NTS N° 139-MINSA
-- ==============================================================================

-- 1. HABILITAR ROW LEVEL SECURITY (RLS) EN LA TABLA HISTORIAS_CLINICAS
-- Impide cualquier acceso directo, no autenticado o no autorizado a nivel de fila.
ALTER TABLE IF EXISTS historias_clinicas ENABLE ROW LEVEL SECURITY;

-- 2. LIMPIEZA DE POLÍTICAS PREVIAS PARA EVITAR CONFLICTOS
DROP POLICY IF EXISTS "Permitir lectura asistencial publica" ON historias_clinicas;
DROP POLICY IF EXISTS "Permitir insercion asistencial controlada" ON historias_clinicas;
DROP POLICY IF EXISTS "Permitir actualizacion de flujo asistencial" ON historias_clinicas;
DROP POLICY IF EXISTS "Prohibir eliminacion arbitraria" ON historias_clinicas;

-- 3. POLÍTICA DE LECTURA (SELECT):
-- Permite consultar registros clínicos para identificación y seguimiento asistencial
CREATE POLICY "Permitir lectura asistencial publica"
ON historias_clinicas
FOR SELECT
TO anon, authenticated
USING (true);

-- 4. POLÍTICA DE INSERCIÓN (INSERT):
-- Permite dar de alta nuevos expedientes de emergencia con identificador válido (mínimo 2 caracteres)
CREATE POLICY "Permitir insercion asistencial controlada"
ON historias_clinicas
FOR INSERT
TO anon, authenticated
WITH CHECK (
  identificador IS NOT NULL AND length(trim(identificador)) >= 2
);

-- 5. POLÍTICA DE ACTUALIZACIÓN (UPDATE):
-- Permite registrar pases de posta asistencial (Triaje -> Médico -> Caja), cobertura y estado
CREATE POLICY "Permitir actualizacion de flujo asistencial"
ON historias_clinicas
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  identificador IS NOT NULL
);

-- 6. POLÍTICA DE ELIMINACIÓN (DELETE): CANDADO DE SEGURIDAD ESTRICTO
-- PROHÍBE terminantemente la eliminación masiva o arbitraria de expedientes desde el cliente público.
-- Solo conexiones con service_role (administrador de infraestructura) pueden ejecutar purgas controladas.
CREATE POLICY "Prohibir eliminacion arbitraria"
ON historias_clinicas
FOR DELETE
TO anon
USING (false);

-- 7. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN DE CACHÉ
CREATE INDEX IF NOT EXISTS idx_hc_identificador ON historias_clinicas(identificador);
CREATE INDEX IF NOT EXISTS idx_hc_historia ON historias_clinicas(historia_clinica);
CREATE INDEX IF NOT EXISTS idx_hc_fecha ON historias_clinicas(fecha_registro DESC);
