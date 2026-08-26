-- Instance settings: operator-editable configuration for a self-hosted Helix.
--
-- The environment remains the source of defaults. A row here is an *override*
-- applied on top of it, so an instance with an empty table behaves exactly as
-- it does today and deleting a row reverts to the environment value.
--
-- Only settings the operator may safely change are ever written here; the
-- application decides which those are, and refuses the rest.

CREATE TABLE instance_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

-- Key versioning for stored secrets.
--
-- Rotating the encryption key previously made every stored provider key
-- undecryptable: `decryptSecret` takes one key and the rows carry no marker
-- saying which key encrypted them. Recording the version lets an instance hold
-- the old key alongside the new one and re-encrypt row by row.
--
-- Existing rows were encrypted under the original key, which is version 1.
ALTER TABLE provider_keys ADD COLUMN key_version integer NOT NULL DEFAULT 1;

-- The encryption keys themselves are never stored here. This records only which
-- version is current and when it was promoted, so a rotation is auditable and a
-- half-finished one is visible rather than silent.
CREATE TABLE encryption_key_versions (
  version     integer     PRIMARY KEY,
  fingerprint text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz
);
