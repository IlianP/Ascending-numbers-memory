-- Ascending Numbers Memory – Einrichtung der globalen Bestenliste (Supabase / Postgres)
-- =============================================================================
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen. Danach stehen in
-- js/leaderboard.js SUPABASE_URL und der öffentliche anon-/publishable-Key.
--
-- Diese Datei ist WIEDERHOLBAR: alles ist `if not exists` bzw.
-- `create or replace`, es werden keine Daten angefasst. Sie erneut auszuführen
-- ist der normale Weg, Änderungen einzuspielen.
--
-- Alle Namen tragen das Präfix `ascending_`. Das Projekt kann also dasselbe
-- Supabase-Projekt mitbenutzen, in dem schon eine andere Bestenliste liegt
-- (z. B. die des Queens-Clone) – die Tabellen und Funktionen kommen sich nicht
-- ins Gehege.
--
-- Sicherheitsmodell:
--   * Row Level Security ist an, und die Tabelle hat KEINE Policy. Weder Lesen
--     noch Schreiben geht direkt; beides läuft über die SECURITY-DEFINER-
--     Funktionen unten, die als Eigentümer laufen und nur unbedenkliche Spalten
--     herausgeben – nie die IP, nie den client_key.
--   * ascending_submit_score() ist der Missbrauchsschutz: Name säubern, Werte
--     prüfen, Unmögliches ablehnen, Best-Effort-Rate-Limit pro Client.
--   * Ehrlich: Der Browser meldet sein Ergebnis selbst. Manipulationssicher ist
--     das nicht und kann es nicht sein. Die Prüfungen sind deshalb bewusst
--     LOCKER gehalten – eine Prüfung, die echte Läufe abweist, kostet
--     Funktionalität und bringt keine Sicherheit.
--
-- Datenschutz: Statt der IP wird nur ein täglich gesalzener Hash gespeichert
-- (client_key), ausschließlich fürs Rate-Limit. Die IP selbst wird nicht abgelegt.

-- 1) Tabelle ------------------------------------------------------------------
-- Gespeichert werden die ROHWERTE (Runden, Zahlen, Fehler), nicht eine fertige
-- Punktzahl. Sollte sich die Wertung je ändern, lässt sich das rückwirkend
-- nachrechnen, ohne dass jemand etwas neu spielen muss.
create table if not exists public.ascending_scores (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  name           text        not null,
  mode           text        not null default 'standard',
  levels         int         not null,
  found          int         not null,
  mistakes       int         not null default 0,
  client_key     text,
  submission_id  uuid
);

create index if not exists ascending_scores_mode_idx
  on public.ascending_scores (mode, found desc, created_at asc);
create index if not exists ascending_scores_ratelimit_idx
  on public.ascending_scores (client_key, created_at);
-- Ein beendeter Durchlauf darf diese Kennung nur einmal belegen.
create unique index if not exists ascending_scores_submission_id_unique
  on public.ascending_scores (submission_id) where submission_id is not null;

-- 2) Row Level Security: an, ohne Policy = kein Direktzugriff für anon ---------
alter table public.ascending_scores enable row level security;
revoke all on public.ascending_scores from anon, authenticated;

-- 3) Wer ruft da an? -----------------------------------------------------------
-- Schlüssel fürs Rate-Limit, ein täglich gesalzener Hash – die IP selbst wird
-- nie gespeichert.
--
-- WICHTIG, UND EIN FRÜHERER FEHLER: `inet_client_addr()` allein taugt dafür
-- nicht. Über die REST-Schnittstelle sitzt PostgREST (bzw. der Pooler) zwischen
-- Browser und Datenbank, und die Funktion liefert dann dessen Adresse – für
-- ALLE Spielenden dieselbe. Aus dem Limit "20 pro Minute und Client" wurde so
-- eines von 20 pro Minute für die ganze Welt: Ein Einzelner konnte damit alle
-- anderen aussperren, während er selbst kaum gebremst wurde. Genau das Gegenteil
-- des Gewollten.
--
-- PostgREST reicht die Kopfzeilen der Anfrage als `request.headers` durch. Von
-- dort kommt die echte Adresse: `cf-connecting-ip` (setzt das Edge-Netz, der
-- Browser kann sie nicht überschreiben), sonst der erste Eintrag aus
-- `x-forwarded-for`, und erst zuletzt `inet_client_addr()` – etwa, wenn jemand
-- die Funktion direkt im SQL-Editor aufruft.
--
-- Ehrlich dazu: Das ist eine grobe Bremse, keine Sicherheit. Fehlt
-- `cf-connecting-ip` und fälscht jemand `x-forwarded-for`, landet er in einem
-- eigenen Eimer statt in keinem – er umgeht damit sein eigenes Limit. Das ist
-- der bessere Tausch: Lieber kommt ein Einzelner durch, als dass er alle
-- anderen mitnimmt. Manipulationssicher ist die Liste ohnehin nicht (der
-- Browser meldet sein Ergebnis selbst), und dafür ist sie auch nicht gedacht.
--
-- Die Funktion faengt alles ab: Ohne `request.headers`, mit kaputtem JSON oder
-- ohne Netzadresse liefert sie trotzdem einen Schlüssel, statt den Eintrag
-- scheitern zu lassen.
create or replace function public.ascending_client_key()
  returns text language plpgsql stable set search_path = public as $$
declare
  v_ip      text;
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null; -- kein PostgREST oder unerwarteter Inhalt
  end;

  if v_headers is not null then
    v_ip := nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip', '')), '');
    if v_ip is null then
      v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
    end if;
  end if;

  if v_ip is null then
    v_ip := coalesce(host(inet_client_addr()), '');
  end if;

  return md5(v_ip || '|' || current_date::text);
end;
$$;

-- 4) Eintragen ----------------------------------------------------------------
-- Gewertet wird `found` (gefundene Zahlen), absteigend. Begründung steht in
-- js/scores.js: Wer mehr Runden schafft, hat zwangsläufig mehr Zahlen gefunden,
-- also ordnet `found` genau wie `levels` – nur feiner. `levels` und `mistakes`
-- fahren als Anzeigewerte mit und bewerten nichts.
--
-- Die Kennung p_submission_id macht den Aufruf idempotent: Geht die Antwort auf
-- einem erfolgreichen Eintrag verloren, liefert der Wiederholungsversuch
-- denselben Rang zurück, statt eine zweite Zeile anzulegen.
create or replace function public.ascending_submit_score(
  p_name text, p_mode text, p_levels int, p_found int, p_mistakes int, p_submission_id uuid
) returns table (rank bigint, total bigint)
  language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_key    text;
  v_recent int;
  v_id     bigint;
  v_at     timestamptz;
  v_mode   text;
  v_found  int;
begin
  if p_submission_id is null then raise exception 'missing submission id'; end if;

  -- Name säubern. Ein leerer Name bleibt LEER und wird NICHT durch ein Wort
  -- ersetzt: Der Platzhalter gehört in die Oberfläche, nicht in die Datenbank.
  v_name := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 20);

  -- Wertebereiche. Absichtlich weit: abgelehnt wird nur, was gar nicht sein kann.
  if coalesce(p_mode, '') not in ('standard') then raise exception 'bad mode'; end if;
  if p_found is null or p_found < 1 or p_found > 99999 then raise exception 'bad counters'; end if;
  if coalesce(p_levels, 0) < 0 or coalesce(p_levels, 0) > 9999
     or coalesce(p_mistakes, 0) < 0 or coalesce(p_mistakes, 0) > 99999 then
    raise exception 'bad counters';
  end if;
  -- Die einzige Quervalidierung, die keiner Konfiguration hinterherlaufen kann:
  -- Jede geschaffte Runde enthält mindestens eine Zahl, es können also nie
  -- weniger Zahlen gefunden als Runden geschafft worden sein.
  if p_found < coalesce(p_levels, 0) then raise exception 'bad counters'; end if;

  -- Schon eingetragen? Dann unverändert zurückgeben (und am Rate-Limit vorbei).
  -- Spalten hier IMMER qualifizieren: `found` ist in plpgsql zugleich die
  -- eingebaute Variable, die sagt, ob die letzte Anweisung Zeilen traf. Ohne
  -- Alias hielte Postgres `found` für mehrdeutig und bräche die Funktion ab.
  select s.id, s.mode, s.found, s.created_at into v_id, v_mode, v_found, v_at
    from public.ascending_scores s where s.submission_id = p_submission_id;

  if not found then
    -- Best-Effort-Rate-Limit: max. 20 Einträge pro Minute und Client. Woher der
    -- Schlüssel kommt und warum nicht aus `inet_client_addr()`, steht bei
    -- ascending_client_key() in Abschnitt 3.
    v_key := ascending_client_key();
    select count(*) into v_recent from public.ascending_scores
      where client_key = v_key and created_at > now() - interval '1 minute';
    if v_recent >= 20 then raise exception 'rate limited'; end if;

    v_mode := p_mode;
    v_found := p_found;
    insert into public.ascending_scores (name, mode, levels, found, mistakes, client_key, submission_id)
    values (v_name, v_mode, coalesce(p_levels, 0), v_found, coalesce(p_mistakes, 0), v_key, p_submission_id)
    on conflict (submission_id) where submission_id is not null do nothing
    returning id, created_at into v_id, v_at;

    -- Zwei gleichzeitige Versuche mit derselben Kennung: einer hat verloren.
    if not found then
      select s.id, s.mode, s.found, s.created_at into v_id, v_mode, v_found, v_at
        from public.ascending_scores s where s.submission_id = p_submission_id;
    end if;
  end if;

  -- Rang = wie viele Zeilen VOR dieser stehen, in exakt der Reihenfolge, die
  -- ascending_top_scores ausgibt. Gleichstand überholt also nicht: Wer dieselbe
  -- Zahl noch einmal erreicht, steht hinter dem älteren Eintrag. Andernfalls
  -- zeigte der gemeldete Rang auf die erste Zeile der Gleichstandsgruppe,
  -- während der Eintrag in der Liste als letzte steht – und die Oberfläche
  -- markierte prompt die falsche Zeile.
  return query
    with bucket as (
      select s.id, s.found, s.created_at from public.ascending_scores s where s.mode = v_mode
    )
    select (select count(*) + 1 from bucket b
              where b.found > v_found
                 or (b.found = v_found and (b.created_at, b.id) < (v_at, v_id)))::bigint,
           (select count(*) from bucket)::bigint;
end;
$$;

-- 5) Lesen (nur unbedenkliche Spalten, bester zuerst) -------------------------
-- created_at fährt mit: Die Oberfläche zeigt daneben das Alter ("vor 3 Tagen").
-- Der Zeitpunkt einer Übermittlung verrät nichts über die Person, und ohne ihn
-- wirkt eine Liste eingefroren.
create or replace function public.ascending_top_scores(
  p_mode text, p_limit int default 10
) returns table (name text, levels int, found int, mistakes int, created_at timestamptz)
  language sql security definer set search_path = public stable as $$
  select s.name, s.levels, s.found, s.mistakes, s.created_at
    from public.ascending_scores s
    where s.mode = p_mode
    -- `id` zuletzt macht die Ordnung total: created_at allein könnte bei zwei
    -- exakt gleichzeitigen Einträgen kippen, und der Rang oben wird in genau
    -- dieser Reihenfolge gezählt.
    order by s.found desc, s.created_at asc, s.id asc
    limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- 6) Ausführrechte nur für diese beiden Funktionen -----------------------------
grant execute on function public.ascending_submit_score(text, text, int, int, int, uuid) to anon;
grant execute on function public.ascending_top_scores(text, int) to anon;

-- Postgres gibt neuen Funktionen von sich aus ein EXECUTE fuer PUBLIC mit.
-- ascending_client_key() ist Innenleben und wird nur aus submit_score heraus
-- gerufen (das laeuft als Eigentümer, braucht also kein Recht für anon).
revoke all on function public.ascending_client_key() from public, anon, authenticated;

-- MIGRATION -------------------------------------------------------------------
-- 2026-09: Rate-Limit pro Client statt pro Datenbankverbindung. Die ganze Datei
-- erneut ausführen; bestehende Zeilen bleiben unverändert.
--
--   Vorher stand in submit_score:
--     v_key := md5(coalesce(host(inet_client_addr()), '') || '|' || current_date::text);
--
--   Über die REST-Schnittstelle ist das die Adresse von PostgREST, nicht die des
--   Browsers – also für alle dieselbe. Das Limit galt damit global: 20 Einträge
--   pro Minute für sämtliche Spielenden zusammen, und wer es ausschöpfte, sperrte
--   alle anderen aus. Neu kommt der Schlüssel aus ascending_client_key()
--   (Abschnitt 3). Bereits gespeicherte client_key-Werte bleiben stehen; sie
--   fallen nach einem Tag ohnehin aus dem Zeitfenster.
--
--   Nachprüfen lässt sich die Wirkung, sobald zwei verschiedene Geräte etwas
--   eingetragen haben – dann muss es mehr als einen Schlüssel geben:
--
--     select count(distinct client_key) as schluessel, count(*) as zeilen
--       from public.ascending_scores where created_at > now() - interval '1 day';
--
--   Steht dort dauerhaft 1 bei mehreren Geräten, erreichen die Kopfzeilen die
--   Funktion nicht, und es bleibt beim alten Verhalten (ein gemeinsamer Eimer).
--
-- 2026-09: Ersteinrichtung.
--
-- Solange diese Datei NICHT ausgeführt wurde, antwortet PostgREST auf beide
-- Funktionen mit 404. Das Spiel fällt dann still auf die Liste im Gerät zurück:
-- Der Reiter "Global" meldet "nicht erreichbar", das Eintragen scheitert mit
-- derselben Meldung, gespielt und gespeichert wird trotzdem. Nichts bricht.
