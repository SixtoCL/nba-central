import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { readJson, writeJson, computeCurrentSeason } from './lib/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const DIST_DIR = path.join(ROOT, 'dist');
const site = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf-8'));

const env = nunjucks.configure(path.join(ROOT, 'templates'), { autoescape: true, trimBlocks: true, lstripBlocks: true });

const currentYear = new Date().getFullYear();
const urls = []; // for sitemap.xml, filled as pages are written

async function renderPage(templateName, context, outPath) {
  const html = env.render(templateName, {
    site,
    currentYear,
    ...context,
  });
  const fullPath = path.join(DIST_DIR, outPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, html);
  const cleanPath = outPath.replace(/index\.html$/, '').replace(/\\/g, '/');
  urls.push({ loc: `/${cleanPath}`, lastmod: context.lastmod });
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(srcPath, destPath);
    else await fs.copyFile(srcPath, destPath);
  }
}

function teamById(teams) {
  return Object.fromEntries(teams.map((t) => [t.id, t]));
}

function attachTeams(game, teamsById) {
  return {
    ...game,
    home_team: teamsById[game.home_team_id],
    visitor_team: teamsById[game.visitor_team_id],
  };
}

async function main() {
  console.log('== NBA Central: generando sitio estatico ==');

  await fs.rm(DIST_DIR, { recursive: true, force: true });

  const meta = (await readJson(path.join(DATA_DIR, 'meta.json'))) || {
    generatedAt: new Date().toISOString(),
    seasons: [computeCurrentSeason()],
    currentSeason: computeCurrentSeason(),
    usingSampleData: {},
  };
  const teams = (await readJson(path.join(DATA_DIR, 'teams.json'))) || [];
  const players = (await readJson(path.join(DATA_DIR, 'players', 'all.json'))) || [];
  const news = (await readJson(path.join(DATA_DIR, 'news', 'latest.json'))) || [];
  const oddsData = (await readJson(path.join(DATA_DIR, 'odds', 'latest.json'))) || [];

  const teamsById = teamById(teams);
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));

  const gamesBySeason = {};
  for (const season of meta.seasons) {
    gamesBySeason[season] = (await readJson(path.join(DATA_DIR, 'games', `season-${season}.json`))) || [];
  }
  const currentSeasonGames = (gamesBySeason[meta.currentSeason] || []).map((g) => attachTeams(g, teamsById));

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysGames = currentSeasonGames.filter((g) => g.date === todayStr);

  // ---------- Home + noticias ----------
  const standingsCurrent = (await readJson(path.join(DATA_DIR, 'standings', `${meta.currentSeason}.json`))) || [];
  const standingsResolved = standingsCurrent
    .map((s) => ({ ...s, team: teamsById[s.team_id] }))
    .sort((a, b) => a.conference_rank - b.conference_rank);

  const leadersCurrentPts = (await readJson(path.join(DATA_DIR, 'leaders', `${meta.currentSeason}`, 'pts.json'))) || [];
  const topScorers = leadersCurrentPts
    .slice(0, 5)
    .map((row) => ({ ...row, player: playersById[row.player_id] }))
    .filter((row) => row.player);

  const oddsPreview = oddsData.slice(0, 3);

  await renderPage(
    'pages/home.njk',
    {
      title: site.siteName,
      description: site.siteTagline,
      path: '/',
      nav: 'home',
      meta,
      todaysGames,
      news,
      newsSecondary: news.slice(1, 5),
      newsMore: news.slice(5, 10),
      topScorers,
      standingsPreview: standingsResolved.slice(0, 5),
      oddsPreview,
      teamsCount: teams.length,
      playersCount: players.length,
      seasonsCount: meta.seasons.length,
      newsCount: news.length,
      lastmod: meta.generatedAt,
    },
    'index.html'
  );

  await renderPage(
    'pages/noticias.njk',
    {
      title: 'Noticias NBA',
      description: 'Ultimas noticias de la NBA',
      path: '/noticias/',
      nav: 'noticias',
      meta,
      todaysGames,
      news,
      standingsPreview: standingsResolved.slice(0, 5),
      lastmod: meta.generatedAt,
    },
    'noticias/index.html'
  );

  // ---------- Equipos ----------
  await renderPage(
    'pages/equipos-index.njk',
    { title: 'Equipos NBA', path: '/equipos/', nav: 'equipos', meta, todaysGames, teams, lastmod: meta.generatedAt },
    'equipos/index.html'
  );

  for (const team of teams) {
    const standing = standingsResolved.find((s) => s.team_id === team.id) || null;
    const roster = players.filter((p) => p.team_id === team.id);

    const seasonHistory = meta.seasons.map((season) => {
      const seasonGames = (gamesBySeason[season] || []).filter(
        (g) => (g.home_team_id === team.id || g.visitor_team_id === team.id) && g.status === 'Final'
      );
      const standingsForSeason = season === meta.currentSeason ? standingsCurrent : [];
      const standingRow = standingsForSeason.find((s) => s.team_id === team.id);
      let wins = standingRow?.wins ?? 0;
      let losses = standingRow?.losses ?? 0;
      if (!standingRow) {
        wins = seasonGames.filter(
          (g) =>
            (g.home_team_id === team.id && g.home_team_score > g.visitor_team_score) ||
            (g.visitor_team_id === team.id && g.visitor_team_score > g.home_team_score)
        ).length;
        losses = seasonGames.length - wins;
      }
      const ptsFor = seasonGames.map((g) => (g.home_team_id === team.id ? g.home_team_score : g.visitor_team_score));
      const ptsAgainst = seasonGames.map((g) => (g.home_team_id === team.id ? g.visitor_team_score : g.home_team_score));
      const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
      return { season, wins, losses, ppg: avg(ptsFor), oppPpg: avg(ptsAgainst) };
    });

    const recentGames = (gamesBySeason[meta.currentSeason] || [])
      .filter((g) => (g.home_team_id === team.id || g.visitor_team_id === team.id) && g.status === 'Final')
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.home_team_id === team.id;
        const opponent = teamsById[isHome ? g.visitor_team_id : g.home_team_id];
        const teamScore = isHome ? g.home_team_score : g.visitor_team_score;
        const oppScore = isHome ? g.visitor_team_score : g.home_team_score;
        return { date: g.date, id: g.id, opponent, teamScore, oppScore, won: teamScore > oppScore };
      });

    await renderPage(
      'pages/equipo.njk',
      {
        title: team.full_name,
        description: `Estadisticas, plantilla y ultimos partidos de ${team.full_name}`,
        path: `/equipos/${team.slug}/`,
        nav: 'equipos',
        meta,
        todaysGames,
        team,
        standing,
        roster,
        seasonHistory,
        recentGames,
        lastmod: meta.generatedAt,
      },
      `equipos/${team.slug}/index.html`
    );
  }

  // ---------- Jugadores ----------
  await renderPage(
    'pages/jugadores-index.njk',
    {
      title: 'Jugadores NBA',
      path: '/jugadores/',
      nav: 'jugadores',
      meta,
      todaysGames,
      players: players.map((p) => ({ ...p, teamName: teamsById[p.team_id]?.full_name })),
      lastmod: meta.generatedAt,
    },
    'jugadores/index.html'
  );

  const seasonAveragesBySeasonPlayer = {};
  for (const season of meta.seasons) {
    const rows = (await readJson(path.join(DATA_DIR, 'season_averages', `${season}.json`))) || [];
    seasonAveragesBySeasonPlayer[season] = Object.fromEntries(rows.map((r) => [r.player_id, r]));
  }

  // Build an index of current-season box scores per player for "recent games".
  const boxscoreFiles = await fs.readdir(path.join(DATA_DIR, 'games')).catch(() => []);
  const currentSeasonBoxscores = [];
  for (const file of boxscoreFiles) {
    if (!file.startsWith('boxscore-')) continue;
    const box = await readJson(path.join(DATA_DIR, 'games', file));
    if (box?.game) currentSeasonBoxscores.push(box);
  }

  for (const player of players) {
    const team = teamsById[player.team_id] || null;
    const seasonHistory = meta.seasons
      .map((season) => seasonAveragesBySeasonPlayer[season]?.[player.id])
      .filter(Boolean)
      .map((row) => ({ ...row }));
    const seasonHistorySample = seasonHistory.some((row) => row.sample);

    const recentGames = currentSeasonBoxscores
      .flatMap((box) =>
        box.stats
          .filter((s) => s.player_id === player.id)
          .map((s) => ({
            date: box.game.date,
            gameId: box.game.id,
            opponent:
              teamsById[s.team_id === box.game.home_team_id ? box.game.visitor_team_id : box.game.home_team_id]
                ?.abbreviation,
            pts: s.pts,
            reb: s.reb,
            ast: s.ast,
          }))
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    await renderPage(
      'pages/jugador.njk',
      {
        title: player.full_name,
        description: `Estadisticas de ${player.full_name}, ultimas ${seasonHistory.length} temporadas`,
        path: `/jugadores/${player.slug}/`,
        nav: 'jugadores',
        meta,
        todaysGames,
        player,
        team,
        seasonHistory,
        seasonHistorySample,
        recentGames,
        lastmod: meta.generatedAt,
      },
      `jugadores/${player.slug}/index.html`
    );
  }

  // ---------- Partidos ----------
  for (const box of currentSeasonBoxscores) {
    const game = attachTeams(box.game, teamsById);
    const withSlug = (s) => ({ ...s, playerSlug: playersById[s.player_id]?.slug || s.player_id });
    const homeStats = box.stats.filter((s) => s.team_id === game.home_team_id).map(withSlug).sort((a, b) => b.pts - a.pts);
    const awayStats = box.stats
      .filter((s) => s.team_id === game.visitor_team_id)
      .map(withSlug)
      .sort((a, b) => b.pts - a.pts);

    await renderPage(
      'pages/partido.njk',
      {
        title: `${game.visitor_team.full_name} @ ${game.home_team.full_name}`,
        description: box.recap || `Resultado y estadisticas de ${game.visitor_team.full_name} en ${game.home_team.full_name}`,
        path: `/partidos/${game.date}/${game.id}.html`,
        nav: 'noticias',
        meta,
        todaysGames,
        game,
        recap: box.recap,
        homeStats,
        awayStats,
        sample: box.stats.some((s) => s.sample),
        lastmod: meta.generatedAt,
      },
      `partidos/${game.date}/${game.id}.html`
    );
  }

  // ---------- Estadisticas (por temporada) ----------
  const statLabels = { pts: 'Puntos', reb: 'Rebotes', ast: 'Asistencias', stl: 'Robos', blk: 'Tapones', fg3m: 'Triples' };
  for (const season of meta.seasons) {
    const leadersByStat = {};
    for (const [stat, label] of Object.entries(statLabels)) {
      const rows = (await readJson(path.join(DATA_DIR, 'leaders', `${season}`, `${stat}.json`))) || [];
      leadersByStat[label] = rows.slice(0, 10).map((r) => ({ ...r, player: playersById[r.player_id] })).filter((r) => r.player);
    }
    const standingsForSeason =
      season === meta.currentSeason
        ? standingsResolved
        : ((await readJson(path.join(DATA_DIR, 'standings', `${season}.json`))) || [])
            .map((s) => ({ ...s, team: teamsById[s.team_id] }))
            .sort((a, b) => a.conference_rank - b.conference_rank);

    const outPath = season === meta.currentSeason ? 'estadisticas/index.html' : `estadisticas/temporada-${season}/index.html`;
    await renderPage(
      'pages/estadisticas.njk',
      {
        title: `Estadisticas NBA ${season}-${(season + 1) % 100}`,
        path: `/${outPath.replace(/index\.html$/, '')}`,
        nav: 'estadisticas',
        meta,
        todaysGames,
        season,
        seasons: meta.seasons,
        leadersByStat,
        standingsEast: standingsForSeason.filter((s) => s.team?.conference === 'East'),
        standingsWest: standingsForSeason.filter((s) => s.team?.conference === 'West'),
        lastmod: meta.generatedAt,
      },
      outPath
    );
  }

  // ---------- Cuotas ----------
  await renderPage(
    'pages/cuotas.njk',
    {
      title: 'Cuotas NBA',
      description: 'Cuotas de ganador, hándicap y total de puntos para los próximos partidos de NBA',
      path: '/cuotas/',
      nav: 'cuotas',
      meta,
      todaysGames,
      oddsData: oddsData.map((g) => ({ ...g, date: (g.commence_time || '').slice(0, 10) })),
      sample: oddsData.some((g) => g.sample),
      lastmod: meta.generatedAt,
    },
    'cuotas/index.html'
  );

  // ---------- Assets estaticos ----------
  await copyDir(path.join(ROOT, 'public'), DIST_DIR);

  // ---------- ads.txt ----------
  const adsTxt = site.adsense.clientId
    ? `google.com, pub-${site.adsense.clientId.replace('ca-pub-', '')}, DIRECT, f08c47fec0942fa0`
    : '# Pega aqui tu linea de ads.txt cuando tengas la cuenta de AdSense aprobada.';
  await fs.writeFile(path.join(DIST_DIR, 'ads.txt'), adsTxt);

  // ---------- robots.txt + sitemap.xml ----------
  const base = site.basePath || '';
  await fs.writeFile(
    path.join(DIST_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}${base}/sitemap.xml\n`
  );

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url><loc>${site.siteUrl}${base}${u.loc}</loc><lastmod>${(u.lastmod || meta.generatedAt).slice(0, 10)}</lastmod></url>`
    ),
    '</urlset>',
  ].join('\n');
  await fs.writeFile(path.join(DIST_DIR, 'sitemap.xml'), sitemap);

  console.log(`Paginas generadas: ${urls.length}`);
  console.log('Generacion completada.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
