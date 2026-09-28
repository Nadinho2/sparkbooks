-- Migration 015: Add Shop Addresses, Optional Geolocation & Original Registerer Attribution
-- Enables field BRMs to physically locate stores, navigate via Google Maps, and tracks original creator vs active managing BRM.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS shop_address TEXT,
  ADD COLUMN IF NOT EXISTS landmark TEXT,
  ADD COLUMN IF NOT EXISTS city_lga TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS registered_by_partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL;

-- Backfill registered_by_partner_id for existing onboarded tenants
UPDATE tenants
SET registered_by_partner_id = partner_id
WHERE partner_id IS NOT NULL AND registered_by_partner_id IS NULL;

-- Indexes for performance & regional filtering
CREATE INDEX IF NOT EXISTS idx_tenants_registered_by_partner ON tenants (registered_by_partner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_state_city ON tenants (state, city_lga);
