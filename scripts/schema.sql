-- Table: linkedin_accounts
create table if not exists public.linkedin_accounts (
  id uuid primary key default gen_random_uuid(),
  client_slug text not null,
  cookies_url text not null,
  proxy text,
  daily_limit int default 50,
  invites_sent int default 0,
  updated_at timestamptz default now()
);

-- Table: outreach_logs
create table if not exists public.outreach_logs (
  id bigserial primary key,
  account_id uuid references public.linkedin_accounts(id),
  type text,
  target_url text,
  status text,
  created_at timestamptz default now(),
  meta jsonb
);
