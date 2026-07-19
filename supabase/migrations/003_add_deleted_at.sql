-- Add soft-delete column to products
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_products_deleted ON products(deleted_at) WHERE deleted_at IS NOT NULL;
