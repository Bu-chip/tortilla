-- Firebase custodia las credenciales; aquí solo se vincula su identificador.
CREATE TABLE invitaciones (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  codigo_hash TEXT NOT NULL UNIQUE,
  creado_por TEXT NOT NULL REFERENCES personas(id),
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  revocada_en TEXT
);
CREATE INDEX idx_invitaciones_grupo ON invitaciones(grupo_id);
-- Límites compartidos entre instancias del Worker. Nunca se almacena la IP original.
CREATE TABLE limites (
  clave TEXT NOT NULL,
  ventana INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (clave, ventana)
);
