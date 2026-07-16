create or replace function leader_private.leader_guard_offer_current_calculation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_calculation_lead_id uuid;
  v_is_current boolean;
begin
  if new.calculation_id is null then
    return new;
  end if;

  select lead_id, is_current_revision
  into v_calculation_lead_id, v_is_current
  from public.leader_lead_calculations
  where id = new.calculation_id;

  if not found then
    raise exception using errcode = '23503', message = 'Расчёт для коммерческого предложения не найден';
  end if;

  if v_calculation_lead_id <> new.lead_id then
    raise exception using errcode = '23514', message = 'Расчёт относится к другой заявке';
  end if;

  if not coalesce(v_is_current, false) then
    raise exception using errcode = '23514', message = 'Новое КП можно сформировать только из актуальной версии расчёта';
  end if;

  return new;
end;
$$;

revoke all on function leader_private.leader_guard_offer_current_calculation() from public;
revoke all on function leader_private.leader_guard_offer_current_calculation() from anon;
revoke all on function leader_private.leader_guard_offer_current_calculation() from authenticated;

drop trigger if exists leader_guard_offer_current_calculation
  on public.leader_commercial_offers;

create trigger leader_guard_offer_current_calculation
before insert or update of calculation_id, lead_id
on public.leader_commercial_offers
for each row
execute function leader_private.leader_guard_offer_current_calculation();

comment on function leader_private.leader_guard_offer_current_calculation()
is 'Prevents new or reassigned commercial offers from using historical calculation revisions or calculations from another lead.';
