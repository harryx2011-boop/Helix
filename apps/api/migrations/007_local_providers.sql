-- Local runtimes as stored providers: Ollama, vLLM and OpenAI-compatible
-- servers are reachable per-caller, not just through the instance-wide
-- OPENAI_COMPATIBLE_BASE_URL. A local runtime is identified by a base URL
-- rather than a key — most need no credential at all — so the row now
-- carries either, instead of a key being mandatory for every provider.

ALTER TABLE provider_keys DROP CONSTRAINT IF EXISTS provider_keys_provider_check;
ALTER TABLE provider_keys ADD CONSTRAINT provider_keys_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'vllm', 'openai-compatible'));

ALTER TABLE provider_keys ADD COLUMN base_url text;

ALTER TABLE provider_keys ALTER COLUMN key_ciphertext DROP NOT NULL;
ALTER TABLE provider_keys ALTER COLUMN key_iv DROP NOT NULL;
ALTER TABLE provider_keys ALTER COLUMN key_last4 DROP NOT NULL;

ALTER TABLE provider_keys ADD CONSTRAINT provider_keys_key_or_base_url
  CHECK (key_ciphertext IS NOT NULL OR base_url IS NOT NULL);

-- Rollback:
-- ALTER TABLE provider_keys DROP CONSTRAINT IF EXISTS provider_keys_key_or_base_url;
-- DELETE FROM provider_keys WHERE provider IN ('ollama', 'vllm', 'openai-compatible');
-- ALTER TABLE provider_keys ALTER COLUMN key_ciphertext SET NOT NULL;
-- ALTER TABLE provider_keys ALTER COLUMN key_iv SET NOT NULL;
-- ALTER TABLE provider_keys ALTER COLUMN key_last4 SET NOT NULL;
-- ALTER TABLE provider_keys DROP COLUMN base_url;
-- ALTER TABLE provider_keys DROP CONSTRAINT IF EXISTS provider_keys_provider_check;
-- ALTER TABLE provider_keys ADD CONSTRAINT provider_keys_provider_check
--   CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openrouter'));
