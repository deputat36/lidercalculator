create or replace function leader_private.leader_set_calculation_revision_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.revision_root_id is null then
    new.revision_root_id := new.id;
    new.revised_from_id := null;
    new.is_current_revision := true;
    new.version_number := 1;
  end if;

  return new;
end;
$$;

revoke all on function leader_private.leader_set_calculation_revision_defaults() from public;
revoke all on function leader_private.leader_set_calculation_revision_defaults() from anon;
revoke all on function leader_private.leader_set_calculation_revision_defaults() from authenticated;

drop trigger if exists leader_set_calculation_revision_defaults
  on public.leader_lead_calculations;

create trigger leader_set_calculation_revision_defaults
before insert on public.leader_lead_calculations
for each row
execute function leader_private.leader_set_calculation_revision_defaults();

comment on function leader_private.leader_set_calculation_revision_defaults()
is 'Keeps legacy and direct calculation inserts compatible by starting each calculation as revision version 1.';
