alter table public.leader_lead_calculations
  add column if not exists revision_root_id uuid,
  add column if not exists revised_from_id uuid,
  add column if not exists is_current_revision boolean not null default true;

update public.leader_lead_calculations
set revision_root_id = id,
    revised_from_id = null,
    is_current_revision = true,
    version_number = 1
where revision_root_id is null;

alter table public.leader_lead_calculations
  alter column revision_root_id set not null;

alter table public.leader_lead_calculations
  drop constraint if exists leader_lead_calculations_revision_root_fk,
  add constraint leader_lead_calculations_revision_root_fk
    foreign key (revision_root_id)
    references public.leader_lead_calculations(id)
    on delete cascade
    deferrable initially deferred;

alter table public.leader_lead_calculations
  drop constraint if exists leader_lead_calculations_revised_from_fk,
  add constraint leader_lead_calculations_revised_from_fk
    foreign key (revised_from_id)
    references public.leader_lead_calculations(id)
    on delete set null;

create unique index if not exists leader_lead_calculations_root_version_uidx
  on public.leader_lead_calculations (revision_root_id, version_number);

create unique index if not exists leader_lead_calculations_one_current_uidx
  on public.leader_lead_calculations (revision_root_id)
  where is_current_revision;

create index if not exists leader_lead_calculations_revised_from_idx
  on public.leader_lead_calculations (revised_from_id)
  where revised_from_id is not null;

create index if not exists leader_lead_calculations_lead_current_created_idx
  on public.leader_lead_calculations (lead_id, is_current_revision, created_at desc);

create or replace function public.leader_create_calculation_revision(
  p_lead_id uuid,
  p_source_calculation_id uuid default null,
  p_title text default null,
  p_need_id uuid default null,
  p_public_comment text default null,
  p_internal_comment text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.leader_lead_calculations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_calculation public.leader_lead_calculations%rowtype;
  v_source public.leader_lead_calculations%rowtype;
  v_item jsonb;
  v_new_id uuid := gen_random_uuid();
  v_root_id uuid;
  v_version integer;
  v_sort_order integer := 0;
  v_name text;
  v_qty numeric;
  v_contractor_price numeric;
  v_client_price numeric;
  v_contractor_sum numeric;
  v_client_sum numeric;
  v_profit numeric;
  v_markup_percent numeric;
  v_margin_percent numeric;
  v_total_contractor numeric := 0;
  v_total_client numeric := 0;
  v_total_profit numeric := 0;
  v_total_margin numeric := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_warning_level text := 'ok';
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Требуется вход в CRM';
  end if;

  if not leader_private.leader_has_access() then
    raise exception using errcode = '42501', message = 'Нет доступа к CRM РА Лидер';
  end if;

  if p_lead_id is null or not exists (
    select 1 from public.leader_leads where id = p_lead_id
  ) then
    raise exception using errcode = 'P0002', message = 'Заявка не найдена';
  end if;

  if p_need_id is not null and not exists (
    select 1
    from public.leader_lead_needs
    where id = p_need_id and lead_id = p_lead_id
  ) then
    raise exception using errcode = '23503', message = 'Потребность не относится к этой заявке';
  end if;

  if p_source_calculation_id is null then
    v_root_id := v_new_id;
    v_version := 1;
  else
    select *
    into v_source
    from public.leader_lead_calculations
    where id = p_source_calculation_id
      and lead_id = p_lead_id;

    if not found then
      raise exception using errcode = '23503', message = 'Исходный расчёт не относится к этой заявке';
    end if;

    v_root_id := coalesce(v_source.revision_root_id, v_source.id);

    perform 1
    from public.leader_lead_calculations
    where id = v_root_id
    for update;

    select coalesce(max(version_number), 0) + 1
    into v_version
    from public.leader_lead_calculations
    where revision_root_id = v_root_id;

    update public.leader_lead_calculations
    set is_current_revision = false,
        updated_at = now(),
        updated_by = auth.uid()
    where revision_root_id = v_root_id
      and is_current_revision;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'В расчёте должна быть хотя бы одна позиция';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::numeric, 0);
    v_contractor_price := coalesce(nullif(v_item ->> 'contractor_price', '')::numeric, 0);
    v_client_price := coalesce(nullif(v_item ->> 'client_price', '')::numeric, 0);

    if v_name = '' then
      raise exception using errcode = '22023', message = 'У каждой позиции должно быть название';
    end if;
    if v_qty <= 0 then
      raise exception using errcode = '22023', message = format('Количество позиции «%s» должно быть больше 0', v_name);
    end if;
    if v_contractor_price < 0 or v_client_price < 0 then
      raise exception using errcode = '22023', message = format('Цена позиции «%s» не может быть отрицательной', v_name);
    end if;

    v_total_contractor := v_total_contractor + (v_qty * v_contractor_price);
    v_total_client := v_total_client + (v_qty * v_client_price);
  end loop;

  v_total_profit := v_total_client - v_total_contractor;
  v_total_margin := case when v_total_client > 0 then (v_total_profit / v_total_client) * 100 else 0 end;

  if v_total_client <= 0 then
    raise exception using errcode = '22023', message = 'Сумма клиенту должна быть больше 0';
  end if;
  if v_total_profit < 0 then
    raise exception using errcode = '22023', message = 'Нельзя сохранить убыточный расчёт';
  end if;

  if v_total_contractor <= 0 then
    v_warnings := v_warnings || jsonb_build_array('Себестоимость равна 0');
  end if;
  if v_total_margin < 20 then
    v_warnings := v_warnings || jsonb_build_array('Маржа ниже 20%');
  end if;
  if jsonb_array_length(v_warnings) > 0 then
    v_warning_level := 'warning';
  end if;

  insert into public.leader_lead_calculations (
    id,
    lead_id,
    need_id,
    client_id,
    title,
    status,
    version_number,
    revision_root_id,
    revised_from_id,
    is_current_revision,
    client_total,
    contractor_cost,
    profit,
    margin_percent,
    warning_level,
    warnings,
    public_comment,
    internal_comment,
    commercial_offer_id,
    order_id,
    created_by,
    updated_by
  )
  values (
    v_new_id,
    p_lead_id,
    p_need_id,
    (select converted_client_id from public.leader_leads where id = p_lead_id),
    coalesce(nullif(btrim(p_title), ''), 'Расчёт'),
    'Черновик',
    v_version,
    v_root_id,
    p_source_calculation_id,
    true,
    v_total_client,
    v_total_contractor,
    v_total_profit,
    v_total_margin,
    v_warning_level,
    v_warnings,
    nullif(btrim(p_public_comment), ''),
    nullif(btrim(p_internal_comment), ''),
    null,
    null,
    auth.uid(),
    auth.uid()
  )
  returning * into v_calculation;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::numeric, 0);
    v_contractor_price := coalesce(nullif(v_item ->> 'contractor_price', '')::numeric, 0);
    v_client_price := coalesce(nullif(v_item ->> 'client_price', '')::numeric, 0);
    v_contractor_sum := v_qty * v_contractor_price;
    v_client_sum := v_qty * v_client_price;
    v_profit := v_client_sum - v_contractor_sum;
    v_markup_percent := case when v_contractor_sum > 0 then (v_profit / v_contractor_sum) * 100 else 0 end;
    v_margin_percent := case when v_client_sum > 0 then (v_profit / v_client_sum) * 100 else 0 end;

    insert into public.leader_lead_calculation_items (
      calculation_id,
      lead_id,
      catalog_id,
      category,
      item_type,
      name,
      unit,
      qty,
      contractor_price,
      contractor_sum,
      markup_percent,
      client_price,
      client_sum,
      profit,
      margin_percent,
      comment,
      data,
      sort_order
    )
    values (
      v_calculation.id,
      p_lead_id,
      nullif(v_item ->> 'catalog_id', '')::uuid,
      nullif(btrim(v_item ->> 'category'), ''),
      nullif(btrim(v_item ->> 'item_type'), ''),
      v_name,
      coalesce(nullif(btrim(v_item ->> 'unit'), ''), 'шт'),
      v_qty,
      v_contractor_price,
      v_contractor_sum,
      v_markup_percent,
      v_client_price,
      v_client_sum,
      v_profit,
      v_margin_percent,
      nullif(btrim(v_item ->> 'comment'), ''),
      coalesce(v_item -> 'data', '{}'::jsonb) || jsonb_build_object(
        'revision_source_calculation_id', p_source_calculation_id,
        'revision_root_calculation_id', v_root_id,
        'revision_number', v_version,
        'revision_created_at', now()
      ),
      v_sort_order
    );
  end loop;

  return v_calculation;
end;
$$;

comment on column public.leader_lead_calculations.revision_root_id
is 'Root calculation shared by every version in one revision chain.';

comment on column public.leader_lead_calculations.revised_from_id
is 'Immediate calculation version used as the source for this revision.';

comment on column public.leader_lead_calculations.is_current_revision
is 'True only for the latest active version in a revision chain.';

comment on function public.leader_create_calculation_revision(uuid, uuid, text, uuid, text, text, jsonb)
is 'Atomically creates an independent calculation or the next locked version in an existing revision chain.';

revoke all on function public.leader_create_calculation_revision(uuid, uuid, text, uuid, text, text, jsonb) from public;
revoke all on function public.leader_create_calculation_revision(uuid, uuid, text, uuid, text, text, jsonb) from anon;
grant execute on function public.leader_create_calculation_revision(uuid, uuid, text, uuid, text, text, jsonb) to authenticated;
