-- ============================================================
-- SparkBooks: Multi-Tier Packaging Units (Unit Ladder)
-- Migration 019: Add packaging_units to products table
-- Supports: Carton -> Pack -> Card -> Pcs / Tablets / Sachets
-- ============================================================

-- 1. Add packaging_units column to products table
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS packaging_units JSONB DEFAULT NULL;

-- 2. Backfill existing products that have pieces_per_pack > 1
UPDATE products
SET packaging_units = jsonb_build_array(
    jsonb_build_object(
        'name', 'pack',
        'size', pieces_per_pack,
        'to_base', pieces_per_pack
    )
)
WHERE pieces_per_pack IS NOT NULL
  AND pieces_per_pack > 1
  AND packaging_units IS NULL;

-- 3. GIN index for packaging_units queries
CREATE INDEX IF NOT EXISTS idx_products_packaging_units
    ON products USING gin (packaging_units)
    WHERE packaging_units IS NOT NULL;
