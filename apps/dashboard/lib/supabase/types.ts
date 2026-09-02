export interface ProfileRow {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  rate_limit: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  profile_id: string | null;
}
