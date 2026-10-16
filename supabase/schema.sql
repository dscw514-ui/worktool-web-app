-- 設備保養作業管理系統：Supabase SQL Editor 執行一次
-- 免登入版本：anon 角色可讀寫，適合不含敏感資料的內部簡易表單。
-- 請注意：任何取得網站網址的人都能讀取、修改與刪除資料；不要存放機密資訊。
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

-- 權限設計：
-- 1) anon 可讀取樣板，讓免登入人員可以選樣板及填寫作業；只有 authenticated 可管理樣板。
-- 2) anon 可新增／更新作業，但不可查詢歷史紀錄；authenticated 可查看及管理歷史紀錄。
-- 3) 因免登入作業無法可靠識別建立者，anon 更新權限仍是公開寫入權限；請勿放入敏感資料。

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies where schemaname='public' and tablename in ('form_templates','maintenance_jobs') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "Templates visible to public" on public.form_templates
  for select to anon, authenticated using (true);
create policy "Authenticated manage templates" on public.form_templates
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Authenticated can read jobs" on public.maintenance_jobs
  for select to authenticated using (auth.uid() is not null);
create policy "Authenticated can manage jobs" on public.maintenance_jobs
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on public.form_templates from anon, authenticated;
revoke all on public.maintenance_jobs from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.form_templates to anon, authenticated;
-- anon 不直接取得資料表寫入權限；改走有憑證驗證的 RPC。
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

-- 管理者須在 Supabase Authentication → Users 建立帳號；前端不提供公開註冊。

-- V3: 保養作業專用 RPC，匿名建立作業及使用隨機憑證繼續編輯。
-- 憑證以 SHA-256 雜湊存入資料庫，不公開給歷史查詢使用者。
alter table public.maintenance_jobs add column if not exists edit_token_hash text;

create or replace function public.save_maintenance_job(p_job jsonb, p_edit_token text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_existing public.maintenance_jobs%rowtype;
  v_authenticated boolean := auth.uid() is not null;
  v_hash text;
begin
  if p_edit_token is null or length(p_edit_token) < 20 then
    raise exception '編輯憑證格式錯誤';
  end if;
  v_hash := encode(digest(p_edit_token,'sha256'),'hex');
  v_id := (p_job->>'id')::uuid;
  if v_id is null then raise exception '缺少作業編號'; end if;
  if length(trim(coalesce(p_job->>'title',''))) = 0 or
     length(trim(coalesce(p_job->>'inspector',''))) = 0 then
    raise exception '請填寫作業名稱及保養人員姓名';
  end if;
  if not exists(select 1 from public.form_templates where id=(p_job->>'template_id')::uuid) then
    raise exception '所選樣板不存在';
  end if;
  select * into v_existing from public.maintenance_jobs where id=v_id for update;
  if found and not v_authenticated and (v_existing.edit_token_hash is null or v_existing.edit_token_hash <> v_hash) then
    raise exception '無權編輯這筆作業，請建立新作業或由管理者登入修改';
  end if;
  if found then
    update public.maintenance_jobs set
      title=p_job->>'title', equipment=coalesce(p_job->>'equipment',''),
      inspector=p_job->>'inspector',template_id=(p_job->>'template_id')::uuid,
      template_title=coalesce(p_job->>'template_title',''),
      scheduled_at=nullif(p_job->>'scheduled_at','')::date,
      status=p_job->>'status',remarks=coalesce(p_job->>'remarks',''),
      results=coalesce(p_job->'results','[]'::jsonb),
      completed_at=nullif(p_job->>'completed_at','')::timestamptz,
      updated_at=now()
    where id=v_id;
  else
    insert into public.maintenance_jobs
      (id,title,equipment,inspector,template_id,template_title,scheduled_at,status,remarks,results,completed_at,edit_token_hash)
    values
      (v_id,p_job->>'title',coalesce(p_job->>'equipment',''),p_job->>'inspector',
      (p_job->>'template_id')::uuid,coalesce(p_job->>'template_title',''),
      nullif(p_job->>'scheduled_at','')::date,p_job->>'status',
      coalesce(p_job->>'remarks',''),coalesce(p_job->'results','[]'::jsonb),
      nullif(p_job->>'completed_at','')::timestamptz,v_hash);
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_maintenance_job(jsonb,text) from public;
grant execute on function public.save_maintenance_job(jsonb,text) to anon, authenticated;
