/**
 * Pack de langue français.
 *
 * Les règles communes à tous les packs sont décrites dans `js/i18n/en.js` :
 * jeux de clés identiques, valeurs sous forme de chaîne ou de fonction d'un
 * objet de paramètres, pluriel et dates dans le pack lui-même, emoji non
 * traduits.
 *
 * Deux particularités qui ne coûtent rien ailleurs :
 *
 *   - le pluriel français commence à 2 (« 0 manche », « 1 manche »,
 *     « 2 manches ») – d'où `frPlural`, qui n'est pas la copie du pack anglais ;
 *   - le français écrit « +4 s » et « 30 secondes » avec une espace
 *     insécable devant l'unité. Elle est écrite ici en `\u00a0`, jamais comme
 *     une espace ordinaire : sinon la valeur peut se retrouver seule en fin de
 *     ligne.
 *
 * Attention à la longueur : le français est 15 à 30 % plus long que l'anglais,
 * et `.score-name` est tronqué sur une seule ligne. Les onglets et les puces
 * ont été choisis courts exprès (« Sur l'appareil », « m. » pour manches).
 */

// Pluriel français : 0 et 1 restent au singulier.
const frPlural = (n, one, many) => `${n} ${n <= 1 ? one : many}`;

const frDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const I18N_FR = {
  // ---------- méta ----------
  'lang.htmlLang': 'fr',
  'meta.description':
    'Mémorisez la position des nombres, puis touchez-les dans l’ordre croissant une fois la grille masquée.',

  // ---------- bandeau ----------
  'hud.level': ({ n }) => `Manche ${n}`,
  'hud.sound.title': 'Son activé/désactivé',
  'hud.restart.title': 'Nouvelle partie (N)',
  'hud.restart.label': 'Nouvelle partie',
  'hud.quit.title': 'Quitter la partie (Échap)',
  'hud.quit.label': 'Quitter la partie',
  'hud.bonus': ({ seconds }) => `+${seconds}\u00a0s`,
  'board.label': 'Grille de jeu',
  'board.cell': ({ n }) => `Case ${n}`,
  'board.cell.value': ({ n, value }) => `Case ${n} : ${value}`,

  // ---------- le bouton sous la grille ----------
  'action.hide': 'Masquer',

  // ---------- carte de démarrage ----------
  'intro.lead':
    'Retenez où se trouvent les nombres. Ils seront ensuite masqués – touchez-les dans l’ordre croissant, en commençant par\u00a01.',
  'intro.rule.time': '<b>30&nbsp;secondes</b> au départ',
  'intro.rule.bonus': 'Chaque manche réussie rapporte jusqu’à <b>4&nbsp;secondes</b>',
  'intro.rule.penalty': 'À partir de la <b>troisième erreur</b> d’une manche, ce bonus fond',
  'intro.rule.grow': 'Une manche sur deux ajoute <b>un nombre</b>',
  'intro.rule.clock': 'Le chrono ne recule jamais &ndash; alors, du calme',
  'intro.start': 'Commencer',

  // ---------- puces ----------
  'chip.sound.on': 'Son activé',
  'chip.sound.off': 'Son coupé',
  'chip.scores': 'Classement',
  'chip.language': 'Langue',
  'chip.language.auto': 'Automatique',

  // ---------- ligne de record ----------
  'best.line': ({ levels, found }) =>
    `Record : <b>${frPlural(levels, 'manche', 'manches')}</b> &middot; <b>${frPlural(found, 'nombre', 'nombres')}</b>`,
  'best.none': 'Pas encore de record &ndash; à vous de jouer.',

  // ---------- carte de fin ----------
  'over.eyebrow': 'Temps écoulé',
  'over.record': 'Nouveau record !',
  'over.done': ({ levels }) => frPlural(levels, 'manche réussie', 'manches réussies'),
  'over.none': 'Aucune manche réussie',
  'over.stat.levels': 'Manches',
  'over.stat.found': 'Nombres',
  'over.stat.mistakes': 'Erreurs',
  'over.again': 'Rejouer',

  // ---------- enregistrer un résultat ----------
  'entry.name.placeholder': 'Votre nom',
  'entry.name.label': 'Votre nom pour le classement',
  'entry.submit': 'Enregistrer',
  'entry.retry': 'Réessayer',
  'entry.rank': ({ rank, total }) => `${rank}ᵉ place sur ${total} dans le classement de l’appareil.`,
  'entry.rank.miss': ({ max }) => `Pas dans les ${max} meilleurs de l’appareil cette fois-ci.`,
  'entry.status.practice': 'Partie d’essai (?zeit / ?runde) – hors classement.',
  'entry.status.localOnly': 'Enregistré sur cet appareil.',
  'entry.status.sending': 'Envoi …',
  'entry.status.retrying': ({ attempt, total }) => `Rien ne passe – tentative ${attempt} sur ${total} …`,
  'entry.status.done': ({ rank, total }) => `Enregistré : ${rank}ᵉ place sur ${total}.`,
  'entry.status.offline': 'Serveur injoignable. La partie est enregistrée sur cet appareil.',
  'entry.status.rejected': ({ text }) => `${text} La partie est enregistrée sur cet appareil.`,

  // ---------- refus du serveur ----------
  'reject.rateLimited': 'Trop d’envois en ce moment. Réessayez dans une minute.',
  'reject.badCounters': 'Le serveur juge ces valeurs impossibles.',
  'reject.badMode': 'Le serveur ne connaît pas ce classement.',
  'reject.missingId': 'Il manque son identifiant à cet envoi.',
  'reject.other': ({ reason }) => `Le serveur a refusé : «\u00a0${reason}\u00a0».`,
  'reject.generic': 'Le serveur a refusé l’envoi.',

  // ---------- classement ----------
  'scores.title': 'Classement',
  'scores.tablist': 'Choisir le classement',
  // La ligne d’onglets est l’endroit le plus étroit de l’application sur
  // 320 px : « Sur l’appareil » y était coupé, d’où la forme courte.
  'scores.tab.local': 'Cet appareil',
  'scores.tab.global': 'Global 🌐',
  'scores.close': 'Retour',
  'scores.empty': 'Rien d’enregistré pour l’instant.',
  'scores.loading': 'Chargement …',
  'scores.offline': 'Le classement global est injoignable. Tout est enregistré sur l’appareil.',
  'scores.anon': 'Sans nom',
  /** « m. » plutôt que « manches » : la ligne doit tenir sur 320 px avec un nom de 20 caractères. */
  'scores.row.value': ({ found, levels }) =>
    `\u00a0${found === 1 ? 'nombre' : 'nombres'} · ${levels}\u00a0m.`,
  'scores.row.title': ({ levels, found, mistakes, date }) =>
    [
      frPlural(levels, 'manche', 'manches'),
      frPlural(found, 'nombre', 'nombres'),
      frPlural(mistakes, 'erreur', 'erreurs'),
      date,
    ].filter(Boolean).join(' · '),
  'scores.date': ({ at }) => frDate.format(new Date(at)),

  // ---------- pause ----------
  'pause.title': 'Pause',
  'pause.lead': 'Le chrono est arrêté.',
  'pause.resume': 'Continuer',
};
