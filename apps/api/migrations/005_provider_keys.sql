-- Provider keys: a caller's own LLM credentials, stored against their Helix
-- API key. When present, every LLM-backed call made with that key uses these
-- instead of the instance's environment credentials.

CREATE TABLE provider_keys (
  api_key_id     uuid        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  provider       text        NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openrouter')),
  key_ciphertext bytea       NOT NULL,
  key_iv         bytea       NOT NULL,
  key_last4      text        NOT NULL,
  model          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, provider)
);
