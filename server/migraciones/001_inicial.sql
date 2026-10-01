-- Esquema inicial. Personas, grupos (ámbito de visibilidad), bares, variedades y degustaciones.

CREATE TABLE personas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  clave_hash TEXT,
  es_demo INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL
);

CREATE TABLE grupos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo_invitacion TEXT UNIQUE,
  es_demo INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL
);

CREATE TABLE membresias (
  persona_id TEXT NOT NULL REFERENCES personas(id),
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  rol TEXT NOT NULL DEFAULT 'miembro',
  creado_en TEXT NOT NULL,
  PRIMARY KEY (persona_id, grupo_id)
);

CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES personas(id),
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL
);

CREATE TABLE bares (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  nombre_norm TEXT NOT NULL,
  zona TEXT,
  ciudad TEXT,
  direccion TEXT,
  lat REAL,
  lng REAL,
  es_demo INTEGER NOT NULL DEFAULT 0,
  creado_por TEXT REFERENCES personas(id),
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX idx_bares_nombre_norm ON bares(nombre_norm);

CREATE TABLE variedades (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bares(id),
  cebolla TEXT NOT NULL CHECK (cebolla IN ('con', 'sin', 'no_se')),
  vegana INTEGER NOT NULL DEFAULT 0,
  ingredientes TEXT NOT NULL DEFAULT '[]',
  firma TEXT NOT NULL,
  nombre TEXT NOT NULL,
  creado_por TEXT REFERENCES personas(id),
  creado_en TEXT NOT NULL,
  UNIQUE (bar_id, firma)
);

CREATE TABLE degustaciones (
  id TEXT PRIMARY KEY,
  op_id TEXT NOT NULL,
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  autor_id TEXT NOT NULL REFERENCES personas(id),
  bar_id TEXT NOT NULL REFERENCES bares(id),
  variedad_id TEXT NOT NULL REFERENCES variedades(id),
  fecha TEXT NOT NULL,
  patata REAL NOT NULL CHECK (patata BETWEEN 1 AND 10),
  jugosidad REAL NOT NULL CHECK (jugosidad BETWEEN 1 AND 10),
  cuajado REAL NOT NULL CHECK (cuajado BETWEEN 1 AND 10),
  sabor REAL NOT NULL CHECK (sabor BETWEEN 1 AND 10),
  presentacion REAL NOT NULL CHECK (presentacion BETWEEN 1 AND 10),
  integracion REAL CHECK (integracion IS NULL OR integracion BETWEEN 1 AND 10),
  tipo_cuajado TEXT CHECK (tipo_cuajado IS NULL OR tipo_cuajado IN ('poco', 'medio', 'bien')),
  sal TEXT CHECK (sal IS NULL OR sal IN ('sosa', 'a_punto', 'salada')),
  tamano TEXT CHECK (tamano IS NULL OR tamano IN ('pequena', 'media', 'generosa')),
  formato TEXT CHECK (formato IS NULL OR formato IN ('pincho', 'racion', 'entera', 'conjunto')),
  precio REAL CHECK (precio IS NULL OR precio > 0),
  acompanamientos TEXT NOT NULL DEFAULT '[]',
  comentario TEXT,
  comentario_privado INTEGER NOT NULL DEFAULT 0,
  origen TEXT,
  retirada_en TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (autor_id, op_id)
);
CREATE INDEX idx_degustaciones_bar ON degustaciones(bar_id);
CREATE INDEX idx_degustaciones_autor ON degustaciones(autor_id);
CREATE INDEX idx_degustaciones_grupo ON degustaciones(grupo_id);

CREATE TABLE preferencias_cebolla (
  persona_id TEXT PRIMARY KEY REFERENCES personas(id),
  lado TEXT NOT NULL CHECK (lado IN ('con', 'sin')),
  actualizado_en TEXT NOT NULL
);
