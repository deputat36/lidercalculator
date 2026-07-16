create or replace function leader_private.leader_expire_offers_after_calculation_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer record;
begin
  if new.revised_from_id is null then
    return new;
  end if;

  for v_offer in
    select o.id, o.lead_id, o.calculation_id, o.status as old_status
    from public.leader_commercial_offers o
    join public.leader_lead_calculations c on c.id = o.calculation_id
    where c.revision_root_id = new.revision_root_id
      and c.id <> new.id
      and o.order_id is null
      and o.status <> 'Устарело'
    for update of o
  loop
    update public.leader_commercial_offers
    set status = 'Устарело',
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_offer.id;

    insert into public.leader_commercial_offer_events (
      offer_id,
      lead_id,
      calculation_id,
      event_type,
      old_status,
      new_status,
      comment,
      created_by,
      created_by_email
    ) values (
      v_offer.id,
      v_offer.lead_id,
      v_offer.calculation_id,
      'КП устарело после пересчёта',
      v_offer.old_status,
      'Устарело',
      format('Создана новая версия расчёта %s. Старое КП сохранено только для истории.', new.version_number),
      auth.uid(),
      auth.email()
    );
  end loop;

  return new;
end;
$$;

revoke all on function leader_private.leader_expire_offers_after_calculation_revision() from public;
revoke all on function leader_private.leader_expire_offers_after_calculation_revision() from anon;
revoke all on function leader_private.leader_expire_offers_after_calculation_revision() from authenticated;

drop trigger if exists leader_expire_offers_after_calculation_revision
  on public.leader_lead_calculations;

create trigger leader_expire_offers_after_calculation_revision
after insert on public.leader_lead_calculations
for each row
execute function leader_private.leader_expire_offers_after_calculation_revision();

create or replace function leader_private.leader_guard_historical_offer_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_current boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Устарело' and new.status <> 'Устарело' then
    raise exception using errcode = '23514', message = 'Устаревшее КП нельзя вернуть в работу. Сформируйте новое КП из актуального расчёта';
  end if;

  if new.status in ('Согласовано', 'КП отправлено', 'Отправлено') and new.calculation_id is not null then
    select is_current_revision
    into v_is_current
    from public.leader_lead_calculations
    where id = new.calculation_id;

    if not coalesce(v_is_current, false) then
      raise exception using errcode = '23514', message = 'Историческое КП нельзя отправить или согласовать. Используйте КП из актуального расчёта';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function leader_private.leader_guard_historical_offer_status() from public;
revoke all on function leader_private.leader_guard_historical_offer_status() from anon;
revoke all on function leader_private.leader_guard_historical_offer_status() from authenticated;

drop trigger if exists leader_guard_historical_offer_status
  on public.leader_commercial_offers;

create trigger leader_guard_historical_offer_status
before update of status
on public.leader_commercial_offers
for each row
execute function leader_private.leader_guard_historical_offer_status();

create or replace function leader_private.leader_guard_order_from_current_offer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer_id uuid;
  v_calculation_id uuid;
  v_offer_status text;
  v_offer_calculation_id uuid;
  v_is_current boolean;
begin
  if coalesce(new.data->>'created_from', '') <> 'leader_create_order_from_offer_rpc' then
    return new;
  end if;

  v_offer_id := nullif(new.data->>'offer_id', '')::uuid;
  v_calculation_id := nullif(new.data->>'calculation_id', '')::uuid;

  if v_offer_id is null or v_calculation_id is null then
    raise exception using errcode = '23514', message = 'Для заказа из КП не хватает связи с предложением или расчётом';
  end if;

  select status, calculation_id
  into v_offer_status, v_offer_calculation_id
  from public.leader_commercial_offers
  where id = v_offer_id;

  if not found then
    raise exception using errcode = '23503', message = 'Коммерческое предложение для заказа не найдено';
  end if;

  if v_offer_calculation_id is distinct from v_calculation_id then
    raise exception using errcode = '23514', message = 'Коммерческое предложение связано с другим расчётом';
  end if;

  if v_offer_status <> 'Согласовано' then
    raise exception using errcode = '23514', message = 'Заказ можно создать только из согласованного актуального КП';
  end if;

  select is_current_revision
  into v_is_current
  from public.leader_lead_calculations
  where id = v_calculation_id;

  if not coalesce(v_is_current, false) then
    raise exception using errcode = '23514', message = 'Нельзя создать заказ из устаревшего КП. Используйте актуальную версию расчёта';
  end if;

  return new;
end;
$$;

revoke all on function leader_private.leader_guard_order_from_current_offer() from public;
revoke all on function leader_private.leader_guard_order_from_current_offer() from anon;
revoke all on function leader_private.leader_guard_order_from_current_offer() from authenticated;

drop trigger if exists leader_guard_order_from_current_offer
  on public.leader_orders;

create trigger leader_guard_order_from_current_offer
before insert on public.leader_orders
for each row
execute function leader_private.leader_guard_order_from_current_offer();

comment on function leader_private.leader_expire_offers_after_calculation_revision()
is 'Marks offers without orders as outdated when a new calculation revision is created and records the lifecycle event.';

comment on function leader_private.leader_guard_historical_offer_status()
is 'Prevents outdated or historical offers from being sent, approved, or reactivated.';

comment on function leader_private.leader_guard_order_from_current_offer()
is 'Prevents order creation from an outdated offer or historical calculation revision.';
