-- Add clerk_user_id to tenants for linking Clerk auth to tenant records
ALTER TABLE tenants ADD COLUMN clerk_user_id TEXT UNIQUE;
CREATE UNIQUE INDEX idx_tenants_clerk_user ON tenants(clerk_user_id);
