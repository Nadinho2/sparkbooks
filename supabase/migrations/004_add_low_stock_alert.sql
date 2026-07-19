-- Add low-stock alert tracking column to products
ALTER TABLE products ADD COLUMN last_low_stock_alert_at TIMESTAMPTZ;
