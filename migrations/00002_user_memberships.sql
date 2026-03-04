-- ========================================
-- user_memberships テーブル + RLS
-- ========================================
-- ユーザーと会社・組織の所属関係を管理するテーブル。
-- Account Center からのログイン時に同期される。

CREATE TABLE user_memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('company', 'organization')),
  scope_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_id)
);

CREATE INDEX idx_user_memberships_user ON user_memberships(user_id);

-- Helper functions for tenant scoping
CREATE OR REPLACE FUNCTION get_user_company_ids()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(scope_id), '{}')
  FROM user_memberships
  WHERE user_id = auth.uid() AND scope_type = 'company';
$$;

CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(scope_id), '{}')
  FROM user_memberships
  WHERE user_id = auth.uid() AND scope_type = 'organization';
$$;

-- RLS
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_memberships" ON user_memberships FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "admin_memberships" ON user_memberships FOR ALL
  USING (is_admin());
