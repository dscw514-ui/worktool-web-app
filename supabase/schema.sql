-- 設備保養作業管理系統：Supabase SQL Editor 執行一次
-- 只允許已登入使用者讀寫。第一版不分角色；所有已登入帳號共享同一套資料。
-- 請勿在前端放 service_role key。

create extension if not exists pgcrypto;

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null default '',
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  equipment text not null default '',
  inspector text not null check (length(trim(inspector)) between 1 and 80),
  template_id uuid references public.form_templates(id) on delete set null,
  template_title text not null default '',
  scheduled_at date,
  status text not null default '進行中' check (status in ('進行中','已完成')),
  remarks text not null default '',
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_jobs_updated_at_idx
  on public.maintenance_jobs (updated_at desc);
create index if not exists maintenance_jobs_status_idx
  on public.maintenance_jobs (status);
create index if not exists maintenance_jobs_template_idx
  on public.maintenance_jobs (template_id);

alter table public.form_templates enable row level security;
alter table public.maintenance_jobs enable row level security;

drop policy if exists "Authenticated users can read templates" on public.form_templates;
create policy "Authenticated users can read templates"
  on public.form_templates for select to authenticated using (true);

drop policy if exists "Authenticated users can insert templates" on public.form_templates;
create policy "Authenticated users can insert templates"
  on public.form_templates for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update templates" on public.form_templates;
create policy "Authenticated users can update templates"
  on public.form_templates for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can delete templates" on public.form_templates;
create policy "Authenticated users can delete templates"
  on public.form_templates for delete to authenticated using (true);

drop policy if exists "Authenticated users can read jobs" on public.maintenance_jobs;
create policy "Authenticated users can read jobs"
  on public.maintenance_jobs for select to authenticated using (true);

drop policy if exists "Authenticated users can insert jobs" on public.maintenance_jobs;
create policy "Authenticated users can insert jobs"
  on public.maintenance_jobs for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update jobs" on public.maintenance_jobs;
create policy "Authenticated users can update jobs"
  on public.maintenance_jobs for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can delete jobs" on public.maintenance_jobs;
create policy "Authenticated users can delete jobs"
  on public.maintenance_jobs for delete to authenticated using (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.form_templates to authenticated;
grant select, insert, update, delete on public.maintenance_jobs to authenticated;

-- 初始樣板：只有在目前完全沒有樣板時才插入
insert into public.form_templates (title, category, fields)
select '設備例行保養單', '通用設備',
'[
 {"id":"f_appearance","label":"外觀清潔與螺絲緊固","type":"choice","options":"合格,異常,不適用","unit":"","required":true},
 {"id":"f_sound","label":"運轉聲音與異常震動檢查","type":"choice","options":"合格,異常,不適用","unit":"","required":true},
 {"id":"f_current","label":"電壓／電流量測","type":"number","options":"","unit":"A / V","required":false},
 {"id":"f_lube","label":"潤滑油／冷卻水檢查","type":"checkbox","options":"","unit":"","required":false},
 {"id":"f_remarks","label":"異常說明與改善建議","type":"text","options":"","unit":"","required":false},
 {"id":"f_datetime","label":"保養日期時間","type":"datetime","options":"","unit":"","required":false}
]'::jsonb
where not exists (select 1 from public.form_templates);

-- 建議在 Supabase Authentication 設定中關閉不需要的公開註冊，
-- 由管理者在 Authentication → Users 建立使用者。
