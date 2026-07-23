const OPENERS = [
  (w, l, ws, ls) => `${w} se impuso a ${l} por ${ws}-${ls}`,
  (w, l, ws, ls) => `Victoria de ${w} ante ${l}, ${ws}-${ls}`,
  (w, l, ws, ls) => `${w} salio con el triunfo frente a ${l} (${ws}-${ls})`,
];

const MARGIN_PHRASES = [
  (m) => `en un partido que se decidio por ${m} puntos`,
  (m) => `tras una diferencia final de ${m} puntos`,
  (m) => `en un choque resuelto por ${m} puntos de margen`,
];

const CLOSE_MARGIN_PHRASES = [
  () => 'en un final muy disputado',
  () => 'en un partido ajustado hasta el final',
  () => 'que se resolvio en los ultimos minutos',
];

function pick(list, seed) {
  return list[seed % list.length];
}

function fullName(player) {
  return `${player.first_name} ${player.last_name}`;
}

function statLeader(stats, key) {
  return stats.reduce((best, s) => ((s[key] || 0) > (best?.[key] || 0) ? s : best), null);
}

// Builds a short, original recap paragraph from box score data.
// `game` is a balldontlie NBAGame object, `stats` is the list of NBAStats
// rows (one per player) for that game.
export function buildRecap(game, stats) {
  const homeWon = game.home_team_score > game.visitor_team_score;
  const winnerTeam = homeWon ? game.home_team : game.visitor_team;
  const loserTeam = homeWon ? game.visitor_team : game.home_team;
  const winnerScore = homeWon ? game.home_team_score : game.visitor_team_score;
  const loserScore = homeWon ? game.visitor_team_score : game.home_team_score;
  const margin = winnerScore - loserScore;
  const seed = game.id || 0;

  const opener = pick(OPENERS, seed)(
    winnerTeam.full_name,
    loserTeam.full_name,
    winnerScore,
    loserScore
  );
  const marginPhrase =
    margin >= 10 ? pick(MARGIN_PHRASES, seed)(margin) : pick(CLOSE_MARGIN_PHRASES, seed)();

  const sentences = [`${opener}, ${marginPhrase}.`];

  const ptsLeader = statLeader(stats, 'pts');
  const rebLeader = statLeader(stats, 'reb');
  const astLeader = statLeader(stats, 'ast');

  if (ptsLeader) {
    sentences.push(
      `${fullName(ptsLeader.player)} lidero la anotacion con ${ptsLeader.pts} puntos` +
        (ptsLeader.reb >= 8 || ptsLeader.ast >= 8
          ? `, sumando ademas ${ptsLeader.reb} rebotes y ${ptsLeader.ast} asistencias.`
          : '.')
    );
  }

  if (rebLeader && rebLeader.player.id !== ptsLeader?.player.id && rebLeader.reb >= 8) {
    sentences.push(`${fullName(rebLeader.player)} domino el rebote con ${rebLeader.reb} capturas.`);
  }

  if (
    astLeader &&
    astLeader.player.id !== ptsLeader?.player.id &&
    astLeader.player.id !== rebLeader?.player.id &&
    astLeader.ast >= 7
  ) {
    sentences.push(`${fullName(astLeader.player)} repartio ${astLeader.ast} asistencias.`);
  }

  return sentences.join(' ');
}
