const KEY = 'ascending-numbers/v1';

const EMPTY = { bestLevels: 0, bestFound: 0, sound: true };

/** localStorage kann im Privatmodus werfen – der Fehler darf das Spiel nicht killen. */
export function load() {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...EMPTY };
  }
}

export function save(patch) {
  const next = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* egal – dann gibt es diesmal eben keinen Rekord */
  }
  return next;
}
