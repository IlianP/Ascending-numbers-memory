/**
 * Paquete de idioma español.
 *
 * Las reglas comunes a todos los paquetes están en `js/i18n/en.js`: mismo juego
 * de claves, valores como cadena o como función de un objeto de parámetros,
 * plural y fechas dentro del propio paquete, emoji sin traducir.
 *
 * Dos detalles propios:
 *
 *   - la apertura de interrogación y exclamación (¿ ¡) forma parte de la frase,
 *     no es decoración: quitarla convierte una pregunta en otra cosa;
 *   - el español escribe «+4 s» con espacio fino antes de la unidad. Va como
 *     ` `, nunca como espacio normal, para que el número y su unidad no se
 *     separen al final de una línea.
 *
 * Cuidado con el largo: el español ocupa entre un 15 y un 30 % más que el
 * inglés, y `.score-name` se recorta en una sola línea. Por eso las pestañas y
 * las fichas se han elegido cortas («En el equipo», «r.» por rondas).
 */

// Plural español: solo el 1 es singular.
const esPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const esDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export const I18N_ES = {
  // ---------- meta ----------
  'lang.htmlLang': 'es',
  'meta.description':
    'Memoriza dónde están los números y, una vez tapados, tócalos en orden ascendente.',

  // ---------- barra superior ----------
  'hud.level': ({ n }) => `Ronda ${n}`,
  'hud.sound.title': 'Sonido sí/no',
  'hud.restart.title': 'Partida nueva (N)',
  'hud.restart.label': 'Partida nueva',
  'hud.quit.title': 'Salir de la partida (Esc)',
  'hud.quit.label': 'Salir de la partida',
  'hud.bonus': ({ seconds }) => `+${seconds} s`,
  'board.label': 'Tablero',
  'board.cell': ({ n }) => `Casilla ${n}`,
  'board.cell.value': ({ n, value }) => `Casilla ${n}: ${value}`,

  // ---------- el botón bajo el tablero ----------
  'action.hide': 'Tapar',

  // ---------- tarjeta de inicio ----------
  'intro.lead':
    'Fíjate en dónde están los números. Después se tapan: tócalos en orden ascendente, empezando por el 1.',
  'intro.rule.time': '<b>30&nbsp;segundos</b> para empezar',
  'intro.rule.bonus': 'Cada ronda superada suma hasta <b>4&nbsp;segundos</b>',
  'intro.rule.penalty': 'Un fallo <b>por n&uacute;mero</b> es gratis: adivinar cuesta el bono',
  'intro.rule.grow': 'Cada dos rondas aparece <b>un número más</b>',
  'intro.rule.clock': 'El reloj nunca va hacia atrás &ndash; así que con calma',
  'intro.start': 'Empezar partida',

  // ---------- fichas ----------
  // «Con/Sin sonido» statt «Sonido activado/apagado»: gleiche Aussage, sechs
  // Zeichen kuerzer - und die Chipreihe ist auf 320 px die engste Zeile der App.
  'chip.sound.on': 'Con sonido',
  'chip.sound.off': 'Sin sonido',
  'chip.scores': 'Clasificación',
  'chip.language': 'Idioma',
  'chip.language.auto': 'Automático',

  // ---------- línea de récord ----------
  'best.line': ({ levels, found }) =>
    `Récord: <b>${esPlural(levels, 'ronda', 'rondas')}</b> &middot; <b>${esPlural(found, 'número', 'números')}</b>`,
  'best.none': 'Aún no hay récord &ndash; a por ello.',

  // ---------- tarjeta final ----------
  'over.eyebrow': 'Se acabó el tiempo',
  'over.record': '¡Nuevo récord!',
  'over.done': ({ levels }) => esPlural(levels, 'ronda superada', 'rondas superadas'),
  'over.none': 'Ninguna ronda superada',
  'over.stat.levels': 'Rondas',
  'over.stat.found': 'Números',
  'over.stat.mistakes': 'Fallos',
  'over.again': 'Jugar otra vez',

  // ---------- registrar el resultado ----------
  'entry.name.placeholder': 'Tu nombre',
  'entry.name.label': 'Tu nombre para la clasificación',
  'entry.submit': 'Registrar',
  'entry.retry': 'Reintentar',
  'entry.rank': ({ rank, total }) => `Puesto ${rank} de ${total} en este equipo.`,
  'entry.rank.miss': ({ max }) => `Esta vez no entra en los ${max} mejores de este equipo.`,
  'entry.status.practice': 'Partida de prueba (?zeit / ?runde) – no cuenta para la clasificación.',
  'entry.status.localOnly': 'Guardado en este equipo.',
  'entry.status.sending': 'Enviando …',
  'entry.status.retrying': ({ attempt, total }) => `No hay manera – intento ${attempt} de ${total} …`,
  'entry.status.done': ({ rank, total }) => `Registrado: puesto ${rank} de ${total}.`,
  'entry.status.offline': 'Servidor no disponible. La partida está guardada en este equipo.',
  'entry.status.rejected': ({ text }) => `${text} La partida está guardada en este equipo.`,

  // ---------- lo que el servidor rechazó ----------
  'reject.rateLimited': 'Ahora mismo hay demasiados registros. En un minuto vuelve a funcionar.',
  'reject.badCounters': 'El servidor considera imposibles estos valores.',
  'reject.badMode': 'El servidor no conoce esta clasificación.',
  'reject.missingId': 'Al registro le falta su identificador.',
  'reject.other': ({ reason }) => `El servidor lo rechazó: «${reason}».`,
  'reject.generic': 'El servidor rechazó el registro.',

  // ---------- clasificación ----------
  'scores.title': 'Clasificación',
  'scores.tablist': 'Elegir clasificación',
  // La fila de pestañas es el sitio más estrecho de la aplicación en 320 px:
  // dos pestañas en una línea, ambas sin salto. De ahí el nombre corto.
  'scores.tab.local': 'Este equipo',
  'scores.tab.global': 'Global 🌐',
  'scores.close': 'Volver',
  'scores.empty': 'Todavía no hay nada registrado.',
  'scores.loading': 'Cargando …',
  'scores.offline': 'La lista global no está disponible ahora. En el equipo está todo guardado.',
  'scores.anon': 'Sin nombre',
  /** «r.» en vez de «rondas»: la fila tiene que caber en 320 px con un nombre de 20 caracteres. */
  'scores.row.value': ({ found, levels }) =>
    ` ${found === 1 ? 'número' : 'números'} · ${levels} r.`,
  'scores.row.title': ({ levels, found, mistakes, date }) =>
    [
      esPlural(levels, 'ronda', 'rondas'),
      esPlural(found, 'número', 'números'),
      esPlural(mistakes, 'fallo', 'fallos'),
      date,
    ].filter(Boolean).join(' · '),
  'scores.date': ({ at }) => esDate.format(new Date(at)),

  // ---------- pausa ----------
  'pause.title': 'Pausa',
  'pause.lead': 'El reloj está parado.',
  'pause.resume': 'Continuar',
};
