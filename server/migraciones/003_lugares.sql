ALTER TABLE bares ADD COLUMN proveedor_id TEXT;
CREATE UNIQUE INDEX idx_bares_proveedor ON bares(proveedor_id) WHERE proveedor_id IS NOT NULL;
