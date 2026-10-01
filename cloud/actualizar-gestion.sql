-- Ejecutar en la consola D1 de Tortillas ANTES de publicar el nuevo Worker.
-- Añade el registro de bajas; conserva todas las tablas y los datos existentes.
CREATE TABLE IF NOT EXISTS bajas_cuenta (
  uid_hash TEXT PRIMARY KEY,
  creado_en TEXT NOT NULL
);
INSERT INTO d1_migrations (name)
SELECT '0003_gestion.sql'
WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name='0003_gestion.sql');
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('personas','grupos','membresias','bares','variedades','preferencias_cebolla','degustaciones','invitaciones','limites','bajas_cuenta')) AS tablas,
       (SELECT COUNT(*) FROM d1_migrations) AS migraciones;
-- Resultado esperado: 10 tablas y 3 migraciones.
