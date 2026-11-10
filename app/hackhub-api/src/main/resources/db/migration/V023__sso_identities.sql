-- Bind directory identities explicitly; email is not proof of account ownership.
-- SSO-only users have no local password. Existing password hashes are preserved.
ALTER TABLE profiles ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE sso_identities (
    tenant_id UUID NOT NULL,
    object_id UUID NOT NULL,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, object_id),
    UNIQUE (tenant_id, profile_id)
);
