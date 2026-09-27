-- Migration 011: Add Brand Customization (Logo & Color) to tenants
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#10B981';
