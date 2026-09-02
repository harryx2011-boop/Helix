-- Persona: the role-specific system-prompt library at persona-ai.vercel.app.
--
-- Two halves. The CATALOG (roles, personas, versions, setup guides) is public,
-- read by everyone, written only by the seed script with the service role —
-- there is no authoring UI in v1. The USER half (forks, favourites, template
-- values, shares) belongs to a profile, which is the same `profiles` row the
-- Helix dashboard uses, because both sites sit behind the same Clerk
-- application. A signed-out visitor keeps everything in localStorage; signing
-- in is what moves it here.

-- ---------------------------------------------------------------- catalog

create table if not exists persona_roles (
  slug        text primary key,                 -- 'support-chat'
  name        text not null,                    -- 'Support (Chat)'
  department  text not null,                    -- filter group: Support, Sales, ...
  color       text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text not null,                    -- lucide-react icon name
  summary     text not null,
  sort_order  integer not null default 0
);

create table if not exists personas (
  id          uuid primary key default gen_random_uuid(),
  role_slug   text not null references persona_roles(slug) on delete cascade,
  slug        text not null,                    -- 'support-chat-v2'; unique within a role
  name        text not null,
  tagline     text not null,
  tone        text not null,                    -- filter chip: Warm, Technical, Formal, Casual
  platforms   text[] not null default '{}',     -- filter chip: email, chat, code, voice
  is_default  boolean not null default false,   -- the one the role page opens on
  search      tsvector generated always as (
                to_tsvector('english', coalesce(name, '') || ' ' || coalesce(tagline, ''))
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (role_slug, slug)
);
create index if not exists personas_search_idx on personas using gin (search);
create unique index if not exists personas_one_default_per_role
  on personas (role_slug) where is_default;

drop trigger if exists personas_touch on personas;
create trigger personas_touch before update on personas
  for each row execute function touch_updated_at();

-- Every edit to a prompt is a new version; the role page shows the changelog.
-- `placeholders` is derived from the body at seed time: every {{TOKEN}} with
-- its label, hint and default, in the order the wizard asks for them.
create table if not exists persona_versions (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid not null references personas(id) on delete cascade,
  version       integer not null,
  body_md       text not null,
  placeholders  jsonb not null default '[]',
  changelog     text not null,
  published_at  timestamptz not null default now(),
  unique (persona_id, version)
);
create index if not exists persona_versions_persona_idx on persona_versions (persona_id, version desc);

-- Setup-guide tabs vary per persona (Support: Email / Chat; Data: SQL / Python).
-- `config_keys` holds the KEY = "value" block the guide opens with.
create table if not exists persona_setup_guides (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references personas(id) on delete cascade,
  tab          text not null,                   -- 'email' | 'chat' | 'sql' | 'python' | ...
  label        text not null,
  icon         text not null,                   -- lucide-react icon name
  body_md      text not null,
  config_keys  jsonb not null default '{}',
  sort_order   integer not null default 0,
  unique (persona_id, tab)
);

-- ---------------------------------------------------------------- user data

create table if not exists persona_forks (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles(id) on delete cascade,
  persona_id         uuid references personas(id) on delete set null,
  source_version_id  uuid references persona_versions(id) on delete set null,
  title              text not null,
  body_md            text not null,
  values             jsonb not null default '{}', -- placeholder -> filled value
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists persona_forks_profile_idx on persona_forks (profile_id, updated_at desc);

drop trigger if exists persona_forks_touch on persona_forks;
create trigger persona_forks_touch before update on persona_forks
  for each row execute function touch_updated_at();

create table if not exists persona_favorites (
  profile_id  uuid not null references profiles(id) on delete cascade,
  persona_id  uuid not null references personas(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, persona_id)
);

-- The templating engine's saved answers (company name, help-centre URL, ...),
-- keyed the way the prompts name them, so one fill serves every persona.
create table if not exists persona_template_values (
  profile_id  uuid not null references profiles(id) on delete cascade,
  key         text not null,
  value       text not null,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, key)
);

-- A share is a frozen copy: the body and values at the moment of sharing, so
-- a later edit to the fork does not change what the recipient sees. Resolved
-- only by the server route with the service role — a browser cannot list
-- shares, which is what keeps a token from being enumerated.
create table if not exists persona_shares (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null check (length(token) between 16 and 64),
  profile_id  uuid references profiles(id) on delete cascade,   -- null: shared anonymously
  persona_id  uuid references personas(id) on delete set null,
  title       text not null,
  body_md     text not null,
  values      jsonb not null default '{}',
  view_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);
create index if not exists persona_shares_profile_idx on persona_shares (profile_id, created_at desc);

-- ---------------------------------------------------------------- RLS

alter table persona_roles enable row level security;
alter table personas enable row level security;
alter table persona_versions enable row level security;
alter table persona_setup_guides enable row level security;
alter table persona_forks enable row level security;
alter table persona_favorites enable row level security;
alter table persona_template_values enable row level security;
alter table persona_shares enable row level security;

-- Catalog: public read, no client writes.
drop policy if exists persona_roles_read on persona_roles;
create policy persona_roles_read on persona_roles for select to anon, authenticated using (true);
drop policy if exists personas_read on personas;
create policy personas_read on personas for select to anon, authenticated using (true);
drop policy if exists persona_versions_read on persona_versions;
create policy persona_versions_read on persona_versions for select to anon, authenticated using (true);
drop policy if exists persona_setup_guides_read on persona_setup_guides;
create policy persona_setup_guides_read on persona_setup_guides for select to anon, authenticated using (true);

-- User data: owner only, and an update cannot hand a row to someone else.
drop policy if exists persona_forks_own on persona_forks;
create policy persona_forks_own on persona_forks for all
  to authenticated
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

drop policy if exists persona_favorites_own on persona_favorites;
create policy persona_favorites_own on persona_favorites for all
  to authenticated
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

drop policy if exists persona_template_values_own on persona_template_values;
create policy persona_template_values_own on persona_template_values for all
  to authenticated
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());

-- Shares: the owner can see and delete their own; creation and resolution by
-- token happen in the server route.
drop policy if exists persona_shares_own_select on persona_shares;
create policy persona_shares_own_select on persona_shares for select
  to authenticated using (profile_id = current_profile_id());
drop policy if exists persona_shares_own_delete on persona_shares;
create policy persona_shares_own_delete on persona_shares for delete
  to authenticated using (profile_id = current_profile_id());

-- ---------------------------------------------------------------- seed: roles
--
-- The eleven roles from the launch set. Personas, versions and guides are
-- loaded from the content files by the seed script, not here.

insert into persona_roles (slug, name, department, color, icon, summary, sort_order) values
  ('support-chat',        'Support (Chat)',      'Support',     '#2F6FE4', 'MessageCircle',   'Web and in-app chat support: troubleshoot, route bugs, hand off to humans.', 10),
  ('support-email',       'Support (Email)',     'Support',     '#2F6FE4', 'Mail',            'Asynchronous ticket resolution with complete multi-step replies.', 20),
  ('customer-success',    'Customer Success',    'Support',     '#1E8E5A', 'HeartHandshake',  'Onboarding, adoption and renewal conversations for existing accounts.', 30),
  ('sales',               'Sales',               'Sales',       '#D9762C', 'BadgeDollarSign', 'Qualify inbound leads, handle pricing questions, book demos.', 40),
  ('marketing',           'Marketing',           'Marketing',   '#C2410C', 'Megaphone',       'Campaign copy, positioning and content that stays on brand.', 50),
  ('product',             'Product',             'Product',     '#7C3AED', 'Boxes',           'Feedback triage, spec drafting and roadmap questions.', 60),
  ('developer-relations', 'Developer Relations', 'Engineering', '#0EA5A5', 'Code2',           'Answer developer questions, write samples, route API feedback.', 70),
  ('data-analytics',      'Data Analytics',      'Engineering', '#0369A1', 'BarChart3',       'Turn questions into SQL or Python and explain the result.', 80),
  ('security',            'Security',            'Security',    '#C6402E', 'Shield',          'Triage reports, answer policy questions, never leak internals.', 90),
  ('finops',              'FinOps',              'Finance',     '#1E8E5A', 'Calculator',      'Cloud spend questions, budget alerts, cost-allocation rules.', 100),
  ('hr',                  'HR',                  'People',      '#8B5CF6', 'Users',           'Policy answers, leave and benefits questions, escalation to people partners.', 110)
on conflict (slug) do update set
  name = excluded.name, department = excluded.department, color = excluded.color,
  icon = excluded.icon, summary = excluded.summary, sort_order = excluded.sort_order;
