-- Migration 016: Add merchant_email column to tenants table
-- Links stores created by field BRMs with merchants when they subsequently sign up on the web.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS merchant_email TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_merchant_email ON tenants (merchant_email);
