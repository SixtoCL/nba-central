import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.js';
import { createClient as createBallDontLieClient } from './lib/balldontlie-client.js';
import { createClient as createOddsClient } from './lib/oddsapi-client.js';
import { fetchNews } from './lib/rss.js';
import { buildRecap } from './lib/recap.js';
import { teamSlug, playerSlug } from './lib/slugify.js';
import { chunk, writeJson, isoDateNDaysAgo, computeCurrentSeason } from './lib/util.js';
import {
  makeStaticTeams,
  makeSamplePlayers,
  makeSampleGames,
  makeSampleSeasonAverages,
  makeSampleStandings,
  makeSampleLeaders,
  makeSampleBoxscore,
  makeSampleOdds,
} from './lib/sample-data.js';

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf-8'));

const LEADER_STAT_TYPES = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m'];
const MAX_NEW_BOXSCORES_PER_RUN = 80;

const hasBallKey = Boolean(process.env.BALLDONTLIE_API_KEY);
const hasOddsKey = Boolean(process.env.ODDS_API_KEY);

const ball = createBallDontLieClient({
  apiKey: process.env.BALLDONTLIE_API_KEY,
  minDelayMs: hasBallKey ? 110 : 12500, // 110ms ~ GOAT (600/min), 12.5s ~ free tier (5/min)
});
const odds = createOddsClient({
  apiKey: process.env.ODDS_API_KEY,
  regions: config.odds.regions,
  markets: config.odds.markets,
  oddsFormat: config.odds.oddsFormat,
});

// Tracks which paid-tier categories have fallen back to sample data this run,
// so we don't keep hammering an endpoint that already failed once.
const degraded = {
  teams: false,
  players: false,
  games: false,
  seasonAverages: false,
  standings: false,
  leaders: false,
  boxscores: false,
  odds: false,
};

// Without any balldontlie key at all, every live call is guaranteed to fail
// (the free tier still requires a registered key). Skip straight to sample
// data instead of making doomed network calls that just burn the throttle
// delay (or worse, hang on an anti-abuse response).
if (!hasBallKey) {
  for (const key of ['teams', 'players', 'games', 'seasonAverages', 'standings', 'leaders', 'boxscores']) {
    degraded[key] = true;
  }
}
if (!hasOddsKey) degraded.odds = true;

async function tryOrSample(label, liveFn, sampleFn) {
  if (degraded[label]) return sampleFn();
  try {
    return await liveFn();
  } catch (err) {
    console.warn(`[aviso] ${label}: usando datos de muestra (revisa tu plan/API key) - ${err.message}`);
    degraded[label] = true;
    return sampleFn();
  }
}

function normalizeTeam(t) {
  return {
    id: t.id,
    city: t.city,
    name: t.name,
    full_name: t.full_name,
    abbreviation: t.abbreviation,
    conference: t.conference,
    division: t.division,
    slug: teamSlug(t),
  };
}

function normalizePlayer(p) {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    full_name: `${p.first_name} ${p.last_name}`,
    position: p.position,
    height: p.height,
    weight: p.weight,
    jersey_number: p.jersey_number,
    college: p.college,
    country: p.country,
    team_id: p.team?.id ?? null,
    slug: playerSlug(p),
  };
}

function normalizeGame(g) {
  return {
    id: g.id,
    date: g.date,
    season: g.season,
    status: g.status,
    postseason: g.postseason,
    home_team_id: g.home_team.id,
    visitor_team_id: g.visitor_team.id,
    home_team_score: g.home_team_score,
    visitor_team_score: g.visitor_team_score,
  };
}

function normalizeStatLine(s) {
  return {
    player_id: s.player.id,
    team_id: s.team.id,
    player: { id: s.player.id, first_name: s.player.first_name, last_name: s.player.last_name },
    min: s.min,
    pts: s.pts,
    reb: s.reb,
    ast: s.ast,
    stl: s.stl,
    blk: s.blk,
    fgm: s.fgm,
    fga: s.fga,
    fg3m: s.fg3m,
    fg3a: s.fg3a,
    ftm: s.ftm,
    fta: s.fta,
    plus_minus: s.plus_minus,
    sample: false,
  };
}

async function main() {
  console.log(`== NBA Central: descarga de datos == (balldontlie key: ${hasBallKey ? 'si' : 'no'}, odds key: ${hasOddsKey ? 'si' : 'no'})`);

  // --- Teams, players, games: free tier, but still needs a registered (even free) API key ---
  const teams = await tryOrSample(
    'teams',
    async () => (await ball.getTeams()).map(normalizeTeam),
    () => makeStaticTeams().map(normalizeTeam)
  );
  await writeJson(path.join(DATA_DIR, 'teams.json'), teams);
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  console.log(`Equipos: ${teams.length} (${degraded.teams ? 'referencia estatica' : 'en vivo'})`);

  let allPlayers = await tryOrSample(
    'players',
    async () => {
      const players = [];
      for (const team of teams) {
        const rawPlayers = await ball.getAllPlayers({ teamIds: [team.id] });
        players.push(...rawPlayers.map(normalizePlayer));
      }
      return players;
    },
    () => makeSamplePlayers(teams).map(normalizePlayer)
  );
  await writeJson(path.join(DATA_DIR, 'players', 'all.json'), allPlayers);
  const playersById = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  console.log(`Jugadores: ${allPlayers.length} (${degraded.players ? 'muestra' : 'en vivo'})`);

  const currentSeason = computeCurrentSeason();
  const seasons = Array.from({ length: config.lastNSeasons }, (_, i) => currentSeason - i);

  const gamesBySeason = {};
  for (const season of seasons) {
    const games = await tryOrSample(
      'games',
      async () => (await ball.getGamesBySeason([season])).map(normalizeGame),
      () => makeSampleGames(teams, season).map(normalizeGame)
    );
    gamesBySeason[season] = games;
    await writeJson(path.join(DATA_DIR, 'games', `season-${season}.json`), games);
    console.log(`Partidos temporada ${season}: ${games.length} (${degraded.games ? 'muestra' : 'en vivo'})`);
  }

  // --- Paid tier (GOAT): season averages, standings, leaders ---
  for (const season of seasons) {
    const playerIds = allPlayers.map((p) => p.id);
    const seasonAverages = await tryOrSample(
      'seasonAverages',
      async () => {
        const batches = chunk(playerIds, 25);
        const rows = [];
        for (const batch of batches) {
          const res = await ball.getSeasonAverages({ type: 'general', season, seasonType: 'regular', playerIds: batch });
          rows.push(
            ...res.map((r) => ({
              player_id: r.player_id,
              season: r.season,
              ...r.stats,
              sample: false,
            }))
          );
        }
        return rows;
      },
      () => makeSampleSeasonAverages(allPlayers, season)
    );
    await writeJson(path.join(DATA_DIR, 'season_averages', `${season}.json`), seasonAverages);
  }
  console.log(`Promedios de temporada: ${degraded.seasonAverages ? 'muestra' : 'en vivo'}`);

  for (const season of seasons) {
    const standings = await tryOrSample(
      'standings',
      async () => {
        const raw = await ball.getStandings(season);
        return raw.map((r) => ({
          team_id: r.team.id,
          season,
          wins: r.wins,
          losses: r.losses,
          conference_rank: r.conference_rank,
          division_rank: r.division_rank,
          home_record: r.home_record,
          road_record: r.road_record,
          sample: false,
        }));
      },
      () => makeSampleStandings(teams, season)
    );
    await writeJson(path.join(DATA_DIR, 'standings', `${season}.json`), standings);
  }
  console.log(`Clasificaciones: ${degraded.standings ? 'muestra' : 'en vivo'}`);

  for (const season of seasons) {
    for (const statType of LEADER_STAT_TYPES) {
      const leaders = await tryOrSample(
        'leaders',
        async () => {
          const raw = await ball.getLeaders({ statType, season });
          return raw.map((r) => ({
            player_id: r.player.id,
            value: r.value,
            stat_type: r.stat_type,
            rank: r.rank,
            season,
            games_played: r.games_played,
            sample: false,
          }));
        },
        () => makeSampleLeaders(allPlayers, statType, season)
      );
      await writeJson(path.join(DATA_DIR, 'leaders', `${season}`, `${statType}.json`), leaders);
    }
  }
  console.log(`Lideres estadisticos: ${degraded.leaders ? 'muestra' : 'en vivo'}`);

  // --- Box scores + recaps for the current season's finished games (incremental) ---
  const currentSeasonGames = gamesBySeason[currentSeason] || [];
  const finishedGames = currentSeasonGames.filter((g) => g.status === 'Final');
  const missingGames = [];
  for (const game of finishedGames) {
    const boxscorePath = path.join(DATA_DIR, 'games', `boxscore-${game.id}.json`);
    const exists = await fs
      .access(boxscorePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) missingGames.push(game);
  }
  const gamesToProcess = missingGames.slice(0, MAX_NEW_BOXSCORES_PER_RUN);
  console.log(`Partidos terminados sin box score: ${missingGames.length} (procesando ${gamesToProcess.length} esta vez)`);

  if (gamesToProcess.length) {
    await tryOrSample(
      'boxscores',
      async () => {
        const batches = chunk(gamesToProcess.map((g) => g.id), 25);
        const statsByGame = {};
        for (const batch of batches) {
          const rawStats = await ball.getStatsByGame(batch);
          for (const raw of rawStats) {
            const gameId = raw.game.id;
            (statsByGame[gameId] ||= []).push(normalizeStatLine(raw));
          }
        }
        for (const game of gamesToProcess) {
          const stats = statsByGame[game.id] || [];
          const gameWithTeams = { ...game, home_team: teamsById[game.home_team_id], visitor_team: teamsById[game.visitor_team_id] };
          const recap = stats.length ? buildRecap(gameWithTeams, stats) : '';
          await writeJson(path.join(DATA_DIR, 'games', `boxscore-${game.id}.json`), { game, stats, recap });
        }
      },
      async () => {
        for (const game of gamesToProcess) {
          const homeRoster = allPlayers.filter((p) => p.team_id === game.home_team_id).slice(0, 8);
          const awayRoster = allPlayers.filter((p) => p.team_id === game.visitor_team_id).slice(0, 8);
          const stats = makeSampleBoxscore(game, homeRoster, awayRoster);
          const gameWithTeams = { ...game, home_team: teamsById[game.home_team_id], visitor_team: teamsById[game.visitor_team_id] };
          const recap = stats.length ? buildRecap(gameWithTeams, stats) : '';
          await writeJson(path.join(DATA_DIR, 'games', `boxscore-${game.id}.json`), { game, stats, recap });
        }
      }
    );
  }

  // --- Odds (Professional tier) ---
  const upcomingOrRecentGames = currentSeasonGames
    .filter((g) => g.date >= isoDateNDaysAgo(2))
    .slice(0, 30);
  const oddsData = await tryOrSample(
    'odds',
    async () => {
      const raw = await odds.getOdds();
      return raw.map((event) => {
        const match = upcomingOrRecentGames.find(
          (g) =>
            teamsById[g.home_team_id]?.full_name === event.home_team &&
            teamsById[g.visitor_team_id]?.full_name === event.away_team
        );
        return {
          game_id: match?.id ?? null,
          commence_time: event.commence_time,
          home_team: event.home_team,
          away_team: event.away_team,
          bookmakers: event.bookmakers,
          sample: false,
        };
      });
    },
    () => makeSampleOdds(finishedGames.slice(-6), teamsById)
  );
  await writeJson(path.join(DATA_DIR, 'odds', 'latest.json'), oddsData);
  console.log(`Cuotas: ${degraded.odds ? 'muestra' : 'en vivo'}`);

  // --- News (RSS, always live) ---
  const news = await fetchNews(config.newsFeeds, { limit: config.newsPerDay });
  await writeJson(path.join(DATA_DIR, 'news', 'latest.json'), news);
  console.log(`Noticias: ${news.length}`);

  // --- Meta ---
  await writeJson(path.join(DATA_DIR, 'meta.json'), {
    generatedAt: new Date().toISOString(),
    seasons,
    currentSeason,
    usingSampleData: degraded,
  });

  console.log('Descarga de datos completada.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
