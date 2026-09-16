-- Das Rate-Limit prüfen: Bekommen zwei Browser auch zwei Eimer?
--
-- Anlass ist ein echter Fehler. Der Schlüssel kam aus `inet_client_addr()`,
-- und das ist über die REST-Schnittstelle die Adresse von PostgREST – für alle
-- Spielenden dieselbe. Aus "20 Einträge pro Minute und Client" wurde damit
-- "20 pro Minute für die ganze Welt", und wer sie ausschöpfte, sperrte alle
-- anderen aus.
--
-- GEGEN EINE WEGWERF-DATENBANK LAUFEN LASSEN, NIEMALS GEGEN DAS LIVE-PROJEKT:
-- Das Skript leert `public.ascending_scores` mehrfach. Einrichtung wie im Kopf
-- von test/sql/rank-order.sql, danach:
--
--   psql -h /tmp/anm-pg -p 5439 -U postgres -v ON_ERROR_STOP=1 -f test/sql/client-key.sql
--
-- `set_config('request.headers', …)` spielt hier nach, was PostgREST im Betrieb
-- setzt – ohne es liefe der Test gegen einen Zustand, den es live nie gibt.
-- ascending_client_key() unter allen Bedingungen, die real vorkommen.
do $$
declare
  k_ohne   text; k_cf_a text; k_cf_b text; k_xff_a text; k_xff_b text; k_kaputt text;
begin
  -- 1) Kein PostgREST (direkt im SQL-Editor): faellt auf inet_client_addr() zurueck.
  perform set_config('request.headers', '', true);
  k_ohne := public.ascending_client_key();
  if k_ohne is null or length(k_ohne) <> 32 then
    raise exception 'ohne Kopfzeilen kam kein Schluessel heraus: %', k_ohne;
  end if;

  -- 2) Cloudflare setzt cf-connecting-ip: zwei Geraete, zwei Schluessel.
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  k_cf_a := public.ascending_client_key();
  perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.4"}', true);
  k_cf_b := public.ascending_client_key();
  if k_cf_a = k_cf_b then
    raise exception 'zwei Geraete teilen sich einen Schluessel - genau der Fehler von vorher';
  end if;
  if k_cf_a = k_ohne then
    raise exception 'die Kopfzeile wird gar nicht gelesen';
  end if;

  -- 3) Ohne cf-connecting-ip: erster Eintrag aus x-forwarded-for, Leerzeichen egal.
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', true);
  k_xff_a := public.ascending_client_key();
  perform set_config('request.headers', '{"x-forwarded-for":" 198.51.100.4 ,10.0.0.1"}', true);
  k_xff_b := public.ascending_client_key();
  if k_xff_a = k_xff_b then raise exception 'x-forwarded-for trennt die Clients nicht'; end if;
  if k_xff_a <> k_cf_a then
    raise exception 'dieselbe Adresse muss denselben Schluessel geben, egal aus welcher Kopfzeile';
  end if;

  -- 4) cf-connecting-ip schlaegt ein gefaelschtes x-forwarded-for.
  perform set_config('request.headers',
    '{"cf-connecting-ip":"203.0.113.7","x-forwarded-for":"1.2.3.4"}', true);
  if public.ascending_client_key() <> k_cf_a then
    raise exception 'ein gefaelschtes x-forwarded-for hat cf-connecting-ip ueberstimmt';
  end if;

  -- 5) Kaputtes JSON darf keinen Eintrag scheitern lassen.
  perform set_config('request.headers', '{kein json', true);
  k_kaputt := public.ascending_client_key();
  if k_kaputt is null or length(k_kaputt) <> 32 then
    raise exception 'kaputte Kopfzeilen werfen die Funktion um';
  end if;

  -- 6) Der Schluessel ist gesalzen, die Adresse selbst steht nirgends drin.
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  if public.ascending_client_key() like '%203.0.113.7%' then
    raise exception 'die IP steckt im Klartext im Schluessel';
  end if;

  raise notice 'ascending_client_key: ok (trennt Clients, faengt alles ab)';
end;
$$;

-- Und die Wirkung dort, wo sie zaehlt: zwei Geraete, getrennte Eimer.
do $$
declare v_dev_a text; v_dev_b text; v_zeilen int;
begin
  truncate public.ascending_scores;

  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  perform public.ascending_submit_score('A', 'standard', 2, 8, 0, gen_random_uuid());
  perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.4"}', true);
  perform public.ascending_submit_score('B', 'standard', 2, 8, 0, gen_random_uuid());

  select count(distinct client_key) into v_zeilen from public.ascending_scores;
  if v_zeilen <> 2 then
    raise exception 'zwei Geraete haben % Schluessel erzeugt, erwartet 2', v_zeilen;
  end if;
  raise notice 'zwei Geraete -> zwei Eimer: ok';
end;
$$;

-- Das Limit greift pro Client - und nur dort.
do $$
declare i int; v_fehler boolean := false;
begin
  truncate public.ascending_scores;
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  for i in 1 .. 20 loop
    perform public.ascending_submit_score('Viel', 'standard', 2, 8, 0, gen_random_uuid());
  end loop;
  begin
    perform public.ascending_submit_score('Zuviel', 'standard', 2, 8, 0, gen_random_uuid());
  exception when others then v_fehler := true;
  end;
  if not v_fehler then raise exception 'das Limit greift gar nicht'; end if;

  -- Der Nachbar darf davon nichts merken. GENAU DAS ging vorher schief.
  perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.4"}', true);
  perform public.ascending_submit_score('Nachbar', 'standard', 2, 8, 0, gen_random_uuid());
  raise notice 'Limit trifft den Vielsender, nicht den Nachbarn: ok';
end;
$$;

select 'alle Pruefungen zum Rate-Limit bestanden' as ergebnis;
