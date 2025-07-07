-- Enhanced database schema for LinkedIn Bot Suite with n8n integration

-- Table: linkedin_accounts (enhanced)
create table if not exists public.linkedin_accounts (
  id uuid primary key default gen_random_uuid(),
  client_slug text not null,
  cookies_url text not null,
  proxy text,
  daily_limit int default 50,
  invites_sent int default 0,
  messages_sent int default 0,
  profile_views int default 0,
  last_activity_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table: outreach_logs (enhanced)
create table if not exists public.outreach_logs (
  id bigserial primary key,
  account_id uuid references public.linkedin_accounts(id),
  type text,
  target_url text,
  status text,
  created_at timestamptz default now(),
  meta jsonb
);

-- Table: api_keys (new)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  client_slug text not null,
  permissions text[] default array[]::text[],
  expires_at timestamptz,
  created_at timestamptz default now(),
  last_used_at timestamptz,
  is_active boolean default true
);

-- Table: workflow_runs (new)
create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,
  n8n_execution_id text,
  status text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_jobs int default 0,
  completed_jobs int default 0,
  failed_jobs int default 0,
  meta jsonb
);

-- Table: job_history (new)
create table if not exists public.job_history (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references public.workflow_runs(id),
  job_type text not null check (job_type in ('invite', 'message', 'profile_view')),
  job_data jsonb not null,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'retry')),
  attempts int default 0,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result jsonb
);

-- Indexes for better performance
create index if not exists idx_linkedin_accounts_client_slug on public.linkedin_accounts(client_slug);
create index if not exists idx_linkedin_accounts_active on public.linkedin_accounts(is_active);
create index if not exists idx_outreach_logs_account_id on public.outreach_logs(account_id);
create index if not exists idx_outreach_logs_created_at on public.outreach_logs(created_at);
create index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_client_slug on public.api_keys(client_slug);
create index if not exists idx_workflow_runs_workflow_id on public.workflow_runs(workflow_id);
create index if not exists idx_workflow_runs_status on public.workflow_runs(status);
create index if not exists idx_job_history_workflow_run_id on public.job_history(workflow_run_id);
create index if not exists idx_job_history_status on public.job_history(status);
create index if not exists idx_job_history_created_at on public.job_history(created_at);

-- RLS (Row Level Security) policies
alter table public.linkedin_accounts enable row level security;
alter table public.outreach_logs enable row level security;
alter table public.api_keys enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.job_history enable row level security;

-- Basic RLS policies (can be customized based on your needs)
create policy "Users can view their own accounts" on public.linkedin_accounts
  for select using (auth.jwt() ->> 'client_slug' = client_slug);

create policy "Service role has full access" on public.linkedin_accounts
  for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Users can view their own logs" on public.outreach_logs
  for select using (
    exists (
      select 1 from public.linkedin_accounts 
      where id = outreach_logs.account_id 
      and client_slug = auth.jwt() ->> 'client_slug'
    )
  );

create policy "Service role has full access to logs" on public.outreach_logs
  for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Users can view their own API keys" on public.api_keys
  for select using (client_slug = auth.jwt() ->> 'client_slug');

create policy "Service role has full access to API keys" on public.api_keys
  for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Users can view their own workflows" on public.workflow_runs
  for select using (
    exists (
      select 1 from public.job_history 
      where workflow_run_id = workflow_runs.id 
      and job_data ->> 'clientSlug' = auth.jwt() ->> 'client_slug'
    )
  );

create policy "Service role has full access to workflows" on public.workflow_runs
  for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Users can view their own job history" on public.job_history
  for select using (job_data ->> 'clientSlug' = auth.jwt() ->> 'client_slug');

create policy "Service role has full access to job history" on public.job_history
  for all using (auth.jwt() ->> 'role' = 'service_role');

-- Functions for updating timestamps
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updating timestamps
create trigger update_linkedin_accounts_updated_at 
  before update on public.linkedin_accounts
  for each row execute function update_updated_at_column();

-- Function to generate API key hash
create or replace function generate_api_key()
returns text as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer := 0;
begin
  for i in 1..32 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Example data (uncomment to insert test data)
-- insert into public.linkedin_accounts (client_slug, cookies_url, proxy, daily_limit) values 
-- ('test-client', 'https://example.com/cookies.json', null, 50);

-- insert into public.api_keys (name, key_hash, client_slug, permissions) values
-- ('Test API Key', encode(digest(generate_api_key(), 'sha256'), 'hex'), 'test-client', array['jobs:create', 'jobs:read', 'webhooks:receive']);