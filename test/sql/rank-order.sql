-- Die Serverhälfte der Bestenliste prüfen: Rang == Listenposition, Idempotenz,
-- Wertebereiche. Reines SQL, damit es ohne Abhängigkeiten läuft.
--
-- GEGEN EINE WEGWERF-DATENBANK LAUFEN LASSEN, NIEMALS GEGEN DAS LIVE-PROJEKT:
-- Das Skript leert `public.ascending_scores` am Anfang.
--
--   initdb -D /tmp/anm-pg/data -U postgres --auth=trust
--   pg_ctl -D /tmp/anm-pg/data -o "-k /tmp/anm-pg -p 5439 -h ''" -l /tmp/anm-pg/log start
--   psql -h /tmp/anm-pg -p 5439 -U postgres -c 'create role anon nologin' \
--                                            -c 'create role authenticated nologin'
--   psql -h /tmp/anm-pg -p 5439 -U postgres -v ON_ERROR_STOP=1 -f docs/leaderboard-setup.sql
--   psql -h /tmp/anm-pg -p 5439 -U postgres -v ON_ERROR_STOP=1 -f test/sql/rank-order.sql
--
-- Das Rate-Limit greift ab 20 Einträgen pro Minute und Client; über einen
-- Unix-Socket ist inet_client_addr() NULL, alle Zeilen teilen sich also einen
-- client_key. Deshalb kommt dieses Skript mit weniger als 20 Einträgen aus.

truncate public.ascending_scores;

do $$
declare
  v_ranks   bigint[] := '{}';
  v_totals  bigint[] := '{}';
  v_found   int[]    := array[12, 40, 12, 7, 40, 25, 12, 3, 40];
  v_rank    bigint;
  v_total   bigint;
  v_pos     bigint;
  v_i       int;
  v_name    text;
begin
  -- Neun Einträge mit reichlich Gleichstand (dreimal 12, dreimal 40).
  for v_i in 1 .. array_length(v_found, 1) loop
    v_name := 'Spieler ' || v_i;
    select rank, total into v_rank, v_total
      from public.ascending_submit_score(
        v_name, 'standard', v_found[v_i] / 4, v_found[v_i], 0,
        ('00000000-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid);
    v_ranks := v_ranks || v_rank;
    v_totals := v_totals || v_total;

    if v_total <> v_i then
      raise exception 'total nach % Einträgen ist %, erwartet %', v_i, v_total, v_i;
    end if;
  end loop;

  -- Der gemeldete Rang muss exakt die Position in der ausgegebenen Liste sein.
  -- Das ist die Regel, an der es sonst hängt: Bei Gleichstand zeigte ein naiv
  -- gezählter Rang auf die erste Zeile der Gruppe, während der neue Eintrag als
  -- letzte steht – und die Oberfläche markiert dann die falsche Zeile.
  for v_i in 1 .. array_length(v_found, 1) loop
    select position into v_pos from (
      select row_number() over (order by s.found desc, s.created_at asc, s.id asc) as position, s.name
        from public.ascending_scores s where s.mode = 'standard'
    ) ranked where ranked.name = 'Spieler ' || v_i;

    if v_pos is null then
      raise exception 'Spieler % steht gar nicht in der Liste', v_i;
    end if;
    -- Der Rang wurde beim Eintragen gemeldet, die Liste ist von jetzt: Spätere
    -- bessere Einträge verschieben eine Zeile nach hinten, nie nach vorn.
    if v_pos < v_ranks[v_i] then
      raise exception 'Spieler %: Rang % gemeldet, steht aber auf Platz %', v_i, v_ranks[v_i], v_pos;
    end if;
  end loop;

  -- Der letzte Eintrag kann nicht mehr verschoben worden sein: dort müssen
  -- gemeldeter Rang und Listenposition auf die Zeile genau übereinstimmen.
  v_i := array_length(v_found, 1);
  select position into v_pos from (
    select row_number() over (order by s.found desc, s.created_at asc, s.id asc) as position, s.name
      from public.ascending_scores s where s.mode = 'standard'
  ) ranked where ranked.name = 'Spieler ' || v_i;
  if v_pos <> v_ranks[v_i] then
    raise exception 'letzter Eintrag: Rang % gemeldet, steht auf Platz %', v_ranks[v_i], v_pos;
  end if;

  -- Gleichstand überholt nicht: Der dritte 40er steht hinter den beiden älteren.
  select position into v_pos from (
    select row_number() over (order by s.found desc, s.created_at asc, s.id asc) as position, s.name
      from public.ascending_scores s where s.mode = 'standard'
  ) ranked where ranked.name = 'Spieler 9';
  if v_pos <> 3 then
    raise exception 'Gleichstand überholt: Spieler 9 steht auf Platz %, erwartet 3', v_pos;
  end if;

  raise notice 'Rang == Listenposition: ok (% Einträge)', array_length(v_found, 1);
end;
$$;

-- Idempotenz: dieselbe Kennung legt keine zweite Zeile an ---------------------
do $$
declare
  v_before bigint;
  v_after  bigint;
  v_rank   bigint;
  v_total  bigint;
begin
  select count(*) into v_before from public.ascending_scores;
  select rank, total into v_rank, v_total from public.ascending_submit_score(
    'Spieler 1', 'standard', 3, 12, 0, '00000000-0000-4000-8000-000000000001'::uuid);
  select count(*) into v_after from public.ascending_scores;

  if v_after <> v_before then
    raise exception 'Wiederholung legte eine zweite Zeile an (% -> %)', v_before, v_after;
  end if;
  if v_total <> v_before then
    raise exception 'Wiederholung meldet total %, erwartet %', v_total, v_before;
  end if;
  raise notice 'Idempotenz: ok';
end;
$$;

-- Was der Server ablehnen muss -----------------------------------------------
do $$
declare
  v_case   text;
  v_cases  text[] := array['leerer Lauf', 'mehr Runden als Zahlen', 'unbekannter Modus', 'ohne Kennung'];
  v_i      int;
  v_failed boolean;
begin
  for v_i in 1 .. array_length(v_cases, 1) loop
    v_case := v_cases[v_i];
    v_failed := false;
    begin
      perform case v_i
        when 1 then (select rank from public.ascending_submit_score('X', 'standard', 0, 0, 0, gen_random_uuid()))
        when 2 then (select rank from public.ascending_submit_score('X', 'standard', 9, 4, 0, gen_random_uuid()))
        when 3 then (select rank from public.ascending_submit_score('X', 'brutal', 2, 8, 0, gen_random_uuid()))
        when 4 then (select rank from public.ascending_submit_score('X', 'standard', 2, 8, 0, null))
      end;
    exception when others then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'nicht abgelehnt: %', v_case;
    end if;
  end loop;
  raise notice 'Wertebereiche: ok';
end;
$$;

-- Namen: säubern, kürzen – und einen leeren Namen leer lassen ------------------
do $$
declare
  v_name text;
begin
  perform public.ascending_submit_score(
    '   Anna    Lena   ', 'standard', 2, 8, 1, '00000000-0000-4000-8000-000000000101'::uuid);
  select s.name into v_name from public.ascending_scores s
    where s.submission_id = '00000000-0000-4000-8000-000000000101'::uuid;
  if v_name <> 'Anna Lena' then
    raise exception 'Name nicht gesäubert: "%"', v_name;
  end if;

  perform public.ascending_submit_score(
    '  ', 'standard', 2, 8, 0, '00000000-0000-4000-8000-000000000102'::uuid);
  select s.name into v_name from public.ascending_scores s
    where s.submission_id = '00000000-0000-4000-8000-000000000102'::uuid;
  if v_name <> '' then
    raise exception 'leerer Name wurde ersetzt: "%"', v_name;
  end if;

  perform public.ascending_submit_score(
    repeat('x', 40), 'standard', 2, 8, 0, '00000000-0000-4000-8000-000000000103'::uuid);
  select s.name into v_name from public.ascending_scores s
    where s.submission_id = '00000000-0000-4000-8000-000000000103'::uuid;
  if length(v_name) <> 20 then
    raise exception 'Name nicht auf 20 Zeichen gekürzt: % Zeichen', length(v_name);
  end if;

  raise notice 'Namen: ok';
end;
$$;

-- Die Leseseite gibt nur unbedenkliche Spalten heraus --------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(a.attname, ',' order by a.attnum) into v_cols
    from pg_proc p
    join unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum) on true
   where p.proname = 'ascending_top_scores' and a.mode = 't';
  if v_cols <> 'name,levels,found,mistakes,created_at' then
    raise exception 'ascending_top_scores gibt % heraus', v_cols;
  end if;
  raise notice 'Leseseite: ok';
end;
$$;

select 'alle SQL-Prüfungen bestanden' as ergebnis;
