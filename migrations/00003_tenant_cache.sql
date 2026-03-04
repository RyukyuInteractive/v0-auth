-- ========================================
-- tenant_cache テーブル + RLS
-- ========================================
-- Account Center から同期した会社・組織のキャッシュ。
-- /api/admin/tenants/sync で全件入れ替え方式で更新される。

CREATE TABLE tenant_cache (
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('company', 'organization')),
  name TEXT NOT NULL,
  slug TEXT,
  status TEXT DEFAULT 'active',
  parent_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, type)
);

CREATE INDEX idx_tenant_cache_type ON tenant_cache(type);

-- RLS
ALTER TABLE tenant_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_tenant_cache" ON tenant_cache FOR ALL
  USING (is_admin());
CREATE POLICY "active_users_read_tenant_cache" ON tenant_cache FOR SELECT
  USING (is_active_user());
