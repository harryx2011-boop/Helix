export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          profile_id: string | null
          rate_limit: number
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          profile_id?: string | null
          rate_limit?: number
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          profile_id?: string | null
          rate_limit?: number
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          anchor: string
          collection: string
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          metadata: Json
          text: string
          tokens: number | null
          url: string
        }
        Insert: {
          anchor: string
          collection?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id: string
          metadata?: Json
          text: string
          tokens?: number | null
          url: string
        }
        Update: {
          anchor?: string
          collection?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json
          text?: string
          tokens?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_state: {
        Row: {
          content_hash: string | null
          etag: string | null
          id: number
          last_modified: string | null
          last_seen_at: string
          site: string
          status_code: number | null
          unchanged_streak: number
          url: string
        }
        Insert: {
          content_hash?: string | null
          etag?: string | null
          id?: number
          last_modified?: string | null
          last_seen_at?: string
          site: string
          status_code?: number | null
          unchanged_streak?: number
          url: string
        }
        Update: {
          content_hash?: string | null
          etag?: string | null
          id?: number
          last_modified?: string | null
          last_seen_at?: string
          site?: string
          status_code?: number | null
          unchanged_streak?: number
          url?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          content: Json
          content_hash: string
          content_type: string | null
          expires_at: string
          fetched_at: string
          final_url: string | null
          id: string
          job_id: string | null
          metadata: Json
          profile: string | null
          status_code: number | null
          tier: string
          url: string
        }
        Insert: {
          content: Json
          content_hash: string
          content_type?: string | null
          expires_at?: string
          fetched_at?: string
          final_url?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          profile?: string | null
          status_code?: number | null
          tier: string
          url: string
        }
        Update: {
          content?: Json
          content_hash?: string
          content_type?: string | null
          expires_at?: string
          fetched_at?: string
          final_url?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json
          profile?: string | null
          status_code?: number | null
          tier?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_key_versions: {
        Row: {
          created_at: string
          fingerprint: string
          retired_at: string | null
          version: number
        }
        Insert: {
          created_at?: string
          fingerprint: string
          retired_at?: string | null
          version: number
        }
        Update: {
          created_at?: string
          fingerprint?: string
          retired_at?: string | null
          version?: number
        }
        Relationships: []
      }
      enrich_results: {
        Row: {
          created_at: string
          fields: Json
          id: number
          input: Json
          job_id: string
          row_index: number
          status: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          id?: number
          input: Json
          job_id: string
          row_index: number
          status?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: number
          input?: Json
          job_id?: string
          row_index?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrich_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      fetch_failures: {
        Row: {
          detail: string | null
          detected_by: string[] | null
          escalation_available: boolean
          id: number
          job_id: string | null
          occurred_at: string
          profile: string | null
          reason: string
          status_code: number | null
          tier: string | null
          tiers_tried: string[] | null
          url: string
        }
        Insert: {
          detail?: string | null
          detected_by?: string[] | null
          escalation_available?: boolean
          id?: number
          job_id?: string | null
          occurred_at?: string
          profile?: string | null
          reason: string
          status_code?: number | null
          tier?: string | null
          tiers_tried?: string[] | null
          url: string
        }
        Update: {
          detail?: string | null
          detected_by?: string[] | null
          escalation_available?: boolean
          id?: number
          job_id?: string | null
          occurred_at?: string
          profile?: string | null
          reason?: string
          status_code?: number | null
          tier?: string | null
          tiers_tried?: string[] | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fetch_failures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      job_tasks: {
        Row: {
          attempts: number
          available_at: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          depth: number
          discovered_at: string
          id: number
          idempotency_key: string
          job_id: string
          site: string | null
          status: Database["public"]["Enums"]["job_status"]
          url: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          depth?: number
          discovered_at?: string
          id?: number
          idempotency_key: string
          job_id: string
          site?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          url: string
        }
        Update: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          depth?: number
          discovered_at?: string
          id?: number
          idempotency_key?: string
          job_id?: string
          site?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          api_key_id: string | null
          completed: number
          created_at: string
          error: string | null
          expires_at: string
          failed: number
          finished_at: string | null
          id: string
          rejections: Json
          request: Json
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          total: number
          type: Database["public"]["Enums"]["job_type"]
          usage: Json
        }
        Insert: {
          api_key_id?: string | null
          completed?: number
          created_at?: string
          error?: string | null
          expires_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          rejections?: Json
          request: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
          type: Database["public"]["Enums"]["job_type"]
          usage?: Json
        }
        Update: {
          api_key_id?: string | null
          completed?: number
          created_at?: string
          error?: string | null
          expires_at?: string
          failed?: number
          finished_at?: string | null
          id?: string
          rejections?: Json
          request?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
          type?: Database["public"]["Enums"]["job_type"]
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "jobs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_checks: {
        Row: {
          changed: boolean
          checked_at: string
          diff: Json | null
          error: string | null
          id: number
          monitor_id: string
          reason: string
          snapshot_id: number | null
        }
        Insert: {
          changed?: boolean
          checked_at?: string
          diff?: Json | null
          error?: string | null
          id?: number
          monitor_id: string
          reason: string
          snapshot_id?: number | null
        }
        Update: {
          changed?: boolean
          checked_at?: string
          diff?: Json | null
          error?: string | null
          id?: number
          monitor_id?: string
          reason?: string
          snapshot_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitor_checks_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_checks_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "monitor_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_snapshots: {
        Row: {
          captured_at: string
          content: string | null
          content_hash: string
          id: number
          monitor_id: string
          url: string
        }
        Insert: {
          captured_at?: string
          content?: string | null
          content_hash: string
          id?: number
          monitor_id: string
          url: string
        }
        Update: {
          captured_at?: string
          content?: string | null
          content_hash?: string
          id?: number
          monitor_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_snapshots_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors: {
        Row: {
          api_key_id: string | null
          changes: number
          checks: number
          claimed_at: string | null
          created_at: string
          diff_config: Json
          id: string
          json_options: Json | null
          last_change_at: string | null
          last_checked_at: string | null
          last_error: string | null
          next_check_at: string | null
          pages_unchanged: number
          schedule: Json
          scrape_options: Json
          sensitivity: string
          status: string
          trigger_config: Json
          updated_at: string
          urls: string[]
          webhook: Json | null
        }
        Insert: {
          api_key_id?: string | null
          changes?: number
          checks?: number
          claimed_at?: string | null
          created_at?: string
          diff_config?: Json
          id?: string
          json_options?: Json | null
          last_change_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          next_check_at?: string | null
          pages_unchanged?: number
          schedule: Json
          scrape_options?: Json
          sensitivity?: string
          status?: string
          trigger_config?: Json
          updated_at?: string
          urls: string[]
          webhook?: Json | null
        }
        Update: {
          api_key_id?: string | null
          changes?: number
          checks?: number
          claimed_at?: string | null
          created_at?: string
          diff_config?: Json
          id?: string
          json_options?: Json | null
          last_change_at?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          next_check_at?: string | null
          pages_unchanged?: number
          schedule?: Json
          scrape_options?: Json
          sensitivity?: string
          status?: string
          trigger_config?: Json
          updated_at?: string
          urls?: string[]
          webhook?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "monitors_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_favorites: {
        Row: {
          created_at: string
          persona_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          persona_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          persona_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_favorites_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_forks: {
        Row: {
          body_md: string
          created_at: string
          id: string
          persona_id: string | null
          profile_id: string
          source_version_id: string | null
          title: string
          updated_at: string
          values: Json
        }
        Insert: {
          body_md: string
          created_at?: string
          id?: string
          persona_id?: string | null
          profile_id: string
          source_version_id?: string | null
          title: string
          updated_at?: string
          values?: Json
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          persona_id?: string | null
          profile_id?: string
          source_version_id?: string | null
          title?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "persona_forks_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_forks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_forks_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "persona_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_roles: {
        Row: {
          color: string
          department: string
          icon: string
          name: string
          slug: string
          sort_order: number
          summary: string
        }
        Insert: {
          color: string
          department: string
          icon: string
          name: string
          slug: string
          sort_order?: number
          summary: string
        }
        Update: {
          color?: string
          department?: string
          icon?: string
          name?: string
          slug?: string
          sort_order?: number
          summary?: string
        }
        Relationships: []
      }
      persona_setup_guides: {
        Row: {
          body_md: string
          config_keys: Json
          icon: string
          id: string
          label: string
          persona_id: string
          sort_order: number
          tab: string
        }
        Insert: {
          body_md: string
          config_keys?: Json
          icon: string
          id?: string
          label: string
          persona_id: string
          sort_order?: number
          tab: string
        }
        Update: {
          body_md?: string
          config_keys?: Json
          icon?: string
          id?: string
          label?: string
          persona_id?: string
          sort_order?: number
          tab?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_setup_guides_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_shares: {
        Row: {
          body_md: string
          created_at: string
          expires_at: string | null
          id: string
          persona_id: string | null
          profile_id: string | null
          title: string
          token: string
          values: Json
          view_count: number
        }
        Insert: {
          body_md: string
          created_at?: string
          expires_at?: string | null
          id?: string
          persona_id?: string | null
          profile_id?: string | null
          title: string
          token: string
          values?: Json
          view_count?: number
        }
        Update: {
          body_md?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          persona_id?: string | null
          profile_id?: string | null
          title?: string
          token?: string
          values?: Json
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "persona_shares_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_template_values: {
        Row: {
          key: string
          profile_id: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          profile_id: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          profile_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_template_values_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_versions: {
        Row: {
          body_md: string
          changelog: string
          id: string
          persona_id: string
          placeholders: Json
          published_at: string
          version: number
        }
        Insert: {
          body_md: string
          changelog: string
          id?: string
          persona_id: string
          placeholders?: Json
          published_at?: string
          version: number
        }
        Update: {
          body_md?: string
          changelog?: string
          id?: string
          persona_id?: string
          placeholders?: Json
          published_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "persona_versions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          platforms: string[]
          role_slug: string
          search: unknown
          slug: string
          tagline: string
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          platforms?: string[]
          role_slug: string
          search?: unknown
          slug: string
          tagline: string
          tone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          platforms?: string[]
          role_slug?: string
          search?: unknown
          slug?: string
          tagline?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_role_slug_fkey"
            columns: ["role_slug"]
            isOneToOne: false
            referencedRelation: "persona_roles"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          clerk_user_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          clerk_user_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          clerk_user_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_keys: {
        Row: {
          api_key_id: string
          base_url: string | null
          created_at: string
          key_ciphertext: string | null
          key_iv: string | null
          key_last4: string | null
          key_version: number
          model: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_id: string
          base_url?: string | null
          created_at?: string
          key_ciphertext?: string | null
          key_iv?: string | null
          key_last4?: string | null
          key_version?: number
          model?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          api_key_id?: string
          base_url?: string | null
          created_at?: string
          key_ciphertext?: string | null
          key_iv?: string | null
          key_last4?: string | null
          key_version?: number
          model?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_keys_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          checksum: string
          filename: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          filename: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          filename?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          event_type: string
          id: number
          job_id: string | null
          last_error: string | null
          monitor_id: string | null
          next_retry_at: string
          payload: Json
          response_status: number | null
          status: string
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          event_type: string
          id?: number
          job_id?: string | null
          last_error?: string | null
          monitor_id?: string | null
          next_retry_at?: string
          payload: Json
          response_status?: number | null
          status?: string
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          event_type?: string
          id?: number
          job_id?: string | null
          last_error?: string | null
          monitor_id?: string | null
          next_retry_at?: string
          payload?: Json
          response_status?: number | null
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_clerk_user_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
    }
    Enums: {
      job_status: "queued" | "running" | "completed" | "failed" | "cancelled"
      job_type: "crawl" | "batch_scrape" | "enrich" | "monitor_check"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      job_status: ["queued", "running", "completed", "failed", "cancelled"],
      job_type: ["crawl", "batch_scrape", "enrich", "monitor_check"],
    },
  },
} as const
