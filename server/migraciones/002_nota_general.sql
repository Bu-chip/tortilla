-- Se conservan los criterios originales y su método. No se calculan notas nuevas a partir de ellos.
CREATE TABLE degustaciones_nueva (
  id TEXT PRIMARY KEY,
  op_id TEXT NOT NULL,
  grupo_id TEXT NOT NULL REFERENCES grupos(id),
  autor_id TEXT NOT NULL REFERENCES personas(id),
  bar_id TEXT NOT NULL REFERENCES bares(id),
  variedad_id TEXT REFERENCES variedades(id),
  fecha TEXT NOT NULL,
  patata REAL CHECK (patata BETWEEN 1 AND 10),
  jugosidad REAL CHECK (jugosidad BETWEEN 1 AND 10),
  cuajado REAL CHECK (cuajado BETWEEN 1 AND 10),
  sabor REAL CHECK (sabor BETWEEN 1 AND 10),
  presentacion REAL CHECK (presentacion BETWEEN 1 AND 10),
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
  version_nota INTEGER NOT NULL DEFAULT 1 CHECK (version_nota IN (1, 2)),
  nota_general REAL CHECK (nota_general IS NULL OR (nota_general BETWEEN 1 AND 10 AND nota_general * 2 = CAST(nota_general * 2 AS INTEGER))),
  textura REAL CHECK (textura IS NULL OR textura BETWEEN 1 AND 10),
  equilibrio REAL CHECK (equilibrio IS NULL OR equilibrio BETWEEN 1 AND 10),
  receta_observada TEXT NOT NULL DEFAULT '{}',
  CHECK ((version_nota = 1 AND patata IS NOT NULL AND jugosidad IS NOT NULL AND cuajado IS NOT NULL AND sabor IS NOT NULL AND presentacion IS NOT NULL AND nota_general IS NULL)
      OR (version_nota = 2 AND nota_general IS NOT NULL AND jugosidad IS NULL AND cuajado IS NULL AND integracion IS NULL)),
  UNIQUE (autor_id, op_id)
);
INSERT INTO degustaciones_nueva (id, op_id, grupo_id, autor_id, bar_id, variedad_id, fecha, patata, jugosidad, cuajado, sabor, presentacion, integracion, tipo_cuajado, sal, tamano, formato, precio, acompanamientos, comentario, comentario_privado, origen, retirada_en, creado_en, actualizado_en) SELECT id, op_id, grupo_id, autor_id, bar_id, variedad_id, fecha, patata, jugosidad, cuajado, sabor, presentacion, integracion, tipo_cuajado, sal, tamano, formato, precio, acompanamientos, comentario, comentario_privado, origen, retirada_en, creado_en, actualizado_en FROM degustaciones;
DROP TABLE degustaciones;
ALTER TABLE degustaciones_nueva RENAME TO degustaciones;
CREATE INDEX idx_degustaciones_bar ON degustaciones(bar_id);
CREATE INDEX idx_degustaciones_autor ON degustaciones(autor_id);
CREATE INDEX idx_degustaciones_grupo ON degustaciones(grupo_id);
