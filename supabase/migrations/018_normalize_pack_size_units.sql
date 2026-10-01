-- ============================================================
-- SparkBooks: Normalize unit for products with pack sizes
-- Migration 018: Ensure products with pieces_per_pack use 'pcs'
-- ============================================================

UPDATE products
SET unit = 'pcs'
WHERE pieces_per_pack IS NOT NULL
  AND (unit ILIKE 'carton%' OR unit ILIKE 'pack%' OR unit ILIKE 'box%' OR unit ILIKE 'crate%');
