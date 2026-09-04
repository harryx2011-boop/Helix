-- The proxy's own key per profile (WEBSITE.md — hosted playground/providers).
--
-- Every client caller in the dashboard reads its API key from a browser-held
-- ApiKeyProvider, which hosted mode deliberately does not mount (a signed-in
-- user has not minted one yet). The fix is server-side proxy routes under
-- /api/app/*, and they need something to call the Helix API WITH. api_keys
-- only stores a sha256 hash — by design, the plaintext is shown once at
-- creation and is not recoverable — so there is no user key to read back.
--
-- Each profile instead gets exactly one dedicated api_keys row, minted lazily
-- on first proxy use via the same insert lib/profiles.ts#createApiKey already
-- does (WEBSITE.md's "no mirror" model: this IS a real key the API
-- authenticates). Its plaintext is encrypted at rest with
-- HELIX_KEY_ENCRYPTION_KEY (lib/keys.ts's AES-256-GCM helpers, provisioned but
-- unused until now) and decrypted only inside a route handler; it never
-- reaches the browser. Storing it on profiles rather than a new table keeps
-- the 1:1 relationship explicit and gives BYOK provider config (provider_keys,
-- keyed on api_key_id) somewhere to live exactly as it already does in
-- self-host: scoped to the key a request actually authenticates with.
--
-- Rollback: drop the two columns. Any dashboard key already minted stays live
-- in api_keys (it is a real key) but becomes unreachable by the proxy; either
-- revoke those rows by name ('Dashboard (internal)') or leave them — they cost
-- nothing idle.

alter table profiles add column if not exists dashboard_key_id         uuid references api_keys(id) on delete set null;
alter table profiles add column if not exists dashboard_key_ciphertext bytea;
alter table profiles add column if not exists dashboard_key_iv         bytea;

-- Never exposed to a browser, including the key owner's own session — same
-- posture as api_keys.key_hash in 0001.
revoke all on profiles from anon, authenticated;
grant select (id, clerk_user_id, email, name, avatar_url, created_at, updated_at,
              role, use_cases, llm_provider, deploy_intent, selected_endpoints,
              heard_from, heard_from_detail, onboarding_completed_at)
  on profiles to authenticated;
grant update (name, avatar_url, role, use_cases, llm_provider, deploy_intent,
              selected_endpoints, heard_from, heard_from_detail, onboarding_completed_at)
  on profiles to authenticated;
