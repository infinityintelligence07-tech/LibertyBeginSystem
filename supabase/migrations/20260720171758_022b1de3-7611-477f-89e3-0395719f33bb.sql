alter table public.profiles
  add column if not exists employees_count_num int,
  add column if not exists leaders_count int,
  add column if not exists business_story text;

alter table public.session_tasks
  add column if not exists due_date date;