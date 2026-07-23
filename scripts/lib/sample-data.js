// Generates clearly-labelled placeholder data (sample: true) for the
// paid-only endpoints (season averages, standings, leaders, box scores,
// odds) so the site can be built and reviewed end-to-end before the GOAT /
// Professional API keys are active. Every record this module returns must be
// consumed alongside a "sample" flag so templates can show a demo banner
// instead of presenting invented numbers as real.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rangeFor(rng, min, max) {
  return Math.round(min + rng() * (max - min));
}

// Real NBA franchise reference data (city/conference/division are public
// facts, not invented) used only if the balldontlie API is unreachable even
// for the free teams endpoint (e.g. no API key registered at all yet).
const STATIC_TEAMS = [
  { id: 1, city: 'Atlanta', name: 'Hawks', abbreviation: 'ATL', conference: 'East', division: 'Southeast' },
  { id: 2, city: 'Boston', name: 'Celtics', abbreviation: 'BOS', conference: 'East', division: 'Atlantic' },
  { id: 3, city: 'Brooklyn', name: 'Nets', abbreviation: 'BKN', conference: 'East', division: 'Atlantic' },
  { id: 4, city: 'Charlotte', name: 'Hornets', abbreviation: 'CHA', conference: 'East', division: 'Southeast' },
  { id: 5, city: 'Chicago', name: 'Bulls', abbreviation: 'CHI', conference: 'East', division: 'Central' },
  { id: 6, city: 'Cleveland', name: 'Cavaliers', abbreviation: 'CLE', conference: 'East', division: 'Central' },
  { id: 7, city: 'Dallas', name: 'Mavericks', abbreviation: 'DAL', conference: 'West', division: 'Southwest' },
  { id: 8, city: 'Denver', name: 'Nuggets', abbreviation: 'DEN', conference: 'West', division: 'Northwest' },
  { id: 9, city: 'Detroit', name: 'Pistons', abbreviation: 'DET', conference: 'East', division: 'Central' },
  { id: 10, city: 'Golden State', name: 'Warriors', abbreviation: 'GSW', conference: 'West', division: 'Pacific' },
  { id: 11, city: 'Houston', name: 'Rockets', abbreviation: 'HOU', conference: 'West', division: 'Southwest' },
  { id: 12, city: 'Indiana', name: 'Pacers', abbreviation: 'IND', conference: 'East', division: 'Central' },
  { id: 13, city: 'LA', name: 'Clippers', abbreviation: 'LAC', conference: 'West', division: 'Pacific' },
  { id: 14, city: 'Los Angeles', name: 'Lakers', abbreviation: 'LAL', conference: 'West', division: 'Pacific' },
  { id: 15, city: 'Memphis', name: 'Grizzlies', abbreviation: 'MEM', conference: 'West', division: 'Southwest' },
  { id: 16, city: 'Miami', name: 'Heat', abbreviation: 'MIA', conference: 'East', division: 'Southeast' },
  { id: 17, city: 'Milwaukee', name: 'Bucks', abbreviation: 'MIL', conference: 'East', division: 'Central' },
  { id: 18, city: 'Minnesota', name: 'Timberwolves', abbreviation: 'MIN', conference: 'West', division: 'Northwest' },
  { id: 19, city: 'New Orleans', name: 'Pelicans', abbreviation: 'NOP', conference: 'West', division: 'Southwest' },
  { id: 20, city: 'New York', name: 'Knicks', abbreviation: 'NYK', conference: 'East', division: 'Atlantic' },
  { id: 21, city: 'Oklahoma City', name: 'Thunder', abbreviation: 'OKC', conference: 'West', division: 'Northwest' },
  { id: 22, city: 'Orlando', name: 'Magic', abbreviation: 'ORL', conference: 'East', division: 'Southeast' },
  { id: 23, city: 'Philadelphia', name: '76ers', abbreviation: 'PHI', conference: 'East', division: 'Atlantic' },
  { id: 24, city: 'Phoenix', name: 'Suns', abbreviation: 'PHX', conference: 'West', division: 'Pacific' },
  { id: 25, city: 'Portland', name: 'Trail Blazers', abbreviation: 'POR', conference: 'West', division: 'Northwest' },
  { id: 26, city: 'Sacramento', name: 'Kings', abbreviation: 'SAC', conference: 'West', division: 'Pacific' },
  { id: 27, city: 'San Antonio', name: 'Spurs', abbreviation: 'SAS', conference: 'West', division: 'Southwest' },
  { id: 28, city: 'Toronto', name: 'Raptors', abbreviation: 'TOR', conference: 'East', division: 'Atlantic' },
  { id: 29, city: 'Utah', name: 'Jazz', abbreviation: 'UTA', conference: 'West', division: 'Northwest' },
  { id: 30, city: 'Washington', name: 'Wizards', abbreviation: 'WAS', conference: 'East', division: 'Southeast' },
];

export function makeStaticTeams() {
  return STATIC_TEAMS.map((t) => ({ ...t, full_name: `${t.city} ${t.name}` }));
}

const SAMPLE_FIRST_NAMES = ['Alex', 'Jordan', 'Marcus', 'Deion', 'Trey', 'Cole', 'Malik', 'Isaiah', 'Devon', 'Bryce', 'Elias', 'Zion'];
const SAMPLE_LAST_NAMES = ['Carter', 'Reynolds', 'Brooks', 'Sanders', 'Whitfield', 'Marshall', 'Ellis', 'Hayes', 'Porter', 'Simmons', 'Vaughn', 'Blake'];

export function makeSamplePlayers(teams, perTeam = 10) {
  const players = [];
  let id = 1;
  for (const team of teams) {
    for (let i = 0; i < perTeam; i += 1) {
      const rng = mulberry32(team.id * 100 + i);
      players.push({
        id,
        first_name: SAMPLE_FIRST_NAMES[Math.floor(rng() * SAMPLE_FIRST_NAMES.length)],
        last_name: SAMPLE_LAST_NAMES[Math.floor(rng() * SAMPLE_LAST_NAMES.length)],
        position: ['G', 'F', 'C'][Math.floor(rng() * 3)],
        height: `${rangeFor(rng, 6, 7)}-${rangeFor(rng, 0, 11)}`,
        weight: `${rangeFor(rng, 180, 260)}`,
        jersey_number: `${rangeFor(rng, 0, 55)}`,
        college: null,
        country: 'USA',
        team: { id: team.id },
        sample: true,
      });
      id += 1;
    }
  }
  return players;
}

export function makeSampleGames(teams, season, countPerTeam = 6) {
  const games = [];
  let id = season * 100000;
  const today = new Date();
  for (const home of teams) {
    for (let i = 0; i < countPerTeam; i += 1) {
      const away = teams[(home.id + i) % teams.length];
      if (away.id === home.id) continue;
      const rng = mulberry32(home.id * 1000 + away.id + season);
      const daysAgo = rangeFor(rng, 1, 200);
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - daysAgo);
      const homeScore = rangeFor(rng, 88, 128);
      const awayScore = rangeFor(rng, 88, 128);
      games.push({
        id: id++,
        date: date.toISOString().slice(0, 10),
        season,
        status: 'Final',
        postseason: false,
        home_team: { id: home.id },
        visitor_team: { id: away.id },
        home_team_score: homeScore,
        visitor_team_score: awayScore,
        sample: true,
      });
    }
  }
  return games;
}

export function makeSampleSeasonAverages(players, season) {
  return players.map((p) => {
    const rng = mulberry32(p.id * 1000 + season);
    const pts = rangeFor(rng, 4, 28);
    return {
      player_id: p.id,
      season,
      gp: rangeFor(rng, 40, 82),
      min: rangeFor(rng, 12, 36),
      pts,
      reb: rangeFor(rng, 2, 11),
      ast: rangeFor(rng, 1, 9),
      stl: Number((rng() * 2).toFixed(1)),
      blk: Number((rng() * 1.6).toFixed(1)),
      fg_pct: Number((0.38 + rng() * 0.18).toFixed(3)),
      fg3_pct: Number((0.28 + rng() * 0.18).toFixed(3)),
      ft_pct: Number((0.65 + rng() * 0.25).toFixed(3)),
      sample: true,
    };
  });
}

export function makeSampleStandings(teams, season) {
  const shuffled = [...teams].sort((a, b) => a.id - b.id);
  return shuffled.map((team, idx) => {
    const rng = mulberry32(team.id * 77 + season);
    const wins = rangeFor(rng, 20, 60);
    const losses = 82 - wins;
    return {
      team_id: team.id,
      season,
      wins,
      losses,
      conference_rank: (idx % 15) + 1,
      division_rank: (idx % 5) + 1,
      home_record: `${Math.round(wins * 0.6)}-${Math.round(losses * 0.4)}`,
      road_record: `${Math.round(wins * 0.4)}-${Math.round(losses * 0.6)}`,
      sample: true,
    };
  });
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return h;
}

export function makeSampleLeaders(players, statType, season) {
  const rng = mulberry32(season * 31 + hashString(statType));
  const withValue = players.map((p) => ({
    player_id: p.id,
    value: rangeFor(rng, 1, 33),
  }));
  withValue.sort((a, b) => b.value - a.value);
  return withValue.slice(0, 10).map((row, idx) => ({
    ...row,
    stat_type: statType,
    season,
    rank: idx + 1,
    games_played: rangeFor(mulberry32(row.player_id), 40, 82),
    sample: true,
  }));
}

export function makeSampleBoxscore(game, homeRoster, awayRoster) {
  const buildLine = (player, teamId) => {
    const rng = mulberry32(player.id * 13 + game.id);
    const pts = rangeFor(rng, 0, 34);
    return {
      player_id: player.id,
      team_id: teamId,
      player: { id: player.id, first_name: player.first_name, last_name: player.last_name },
      min: `${rangeFor(rng, 8, 38)}`,
      pts,
      reb: rangeFor(rng, 0, 13),
      ast: rangeFor(rng, 0, 11),
      stl: rangeFor(rng, 0, 4),
      blk: rangeFor(rng, 0, 3),
      fgm: Math.round(pts * 0.4),
      fga: Math.round(pts * 0.4) + rangeFor(rng, 2, 8),
      fg3m: rangeFor(rng, 0, 5),
      fg3a: rangeFor(rng, 0, 9),
      ftm: rangeFor(rng, 0, 8),
      fta: rangeFor(rng, 0, 9),
      plus_minus: rangeFor(rng, -20, 20),
      sample: true,
    };
  };

  return [
    ...homeRoster.map((p) => buildLine(p, game.home_team_id)),
    ...awayRoster.map((p) => buildLine(p, game.visitor_team_id)),
  ];
}

export function makeSampleOdds(games, teamsById) {
  const books = ['Betclic', 'Unibet', 'Bet365', 'Betsson'];
  return games.map((game) => {
    const rng = mulberry32(game.id);
    const homeName = teamsById[game.home_team_id]?.full_name || 'Local';
    const awayName = teamsById[game.visitor_team_id]?.full_name || 'Visitante';
    return {
      game_id: game.id,
      commence_time: game.date,
      home_team: homeName,
      away_team: awayName,
      bookmakers: books.map((title) => {
        const homePrice = Number((1.4 + rng() * 2).toFixed(2));
        const awayPrice = Number((1.4 + rng() * 2).toFixed(2));
        const total = rangeFor(rng, 210, 235);
        return {
          key: title.toLowerCase(),
          title,
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: homeName, price: homePrice },
                { name: awayName, price: awayPrice },
              ],
            },
            {
              key: 'totals',
              outcomes: [
                { name: 'Over', point: total, price: 1.9 },
                { name: 'Under', point: total, price: 1.9 },
              ],
            },
          ],
        };
      }),
      sample: true,
    };
  });
}
