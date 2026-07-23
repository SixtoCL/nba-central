const BASE_URL = 'https://api.balldontlie.io/nba/v1';

export class BallDontLieApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BallDontLieApiError';
    this.status = status;
  }
}

// Free tier: 5 req/min. Keep a conservative default so the client never gets
// throttled even on the cheapest plan; override via minDelayMs if the caller
// knows it is on ALL-STAR/GOAT.
export function createClient({ apiKey, minDelayMs = 12500 } = {}) {
  let lastRequestAt = 0;

  async function throttle() {
    const wait = lastRequestAt + minDelayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  }

  async function request(path, params = {}) {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(`${key}[]`, v);
      } else {
        url.searchParams.set(key, value);
      }
    }

    await throttle();

    const headers = {};
    if (apiKey) headers.Authorization = apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(url, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BallDontLieApiError(
        `balldontlie ${path} -> ${res.status}: ${body.slice(0, 200)}`,
        res.status
      );
    }
    return res.json();
  }

  async function paginateAll(path, params = {}, { maxPages = 50 } = {}) {
    let cursor;
    const all = [];
    for (let page = 0; page < maxPages; page += 1) {
      const json = await request(path, { ...params, cursor, per_page: 100 });
      all.push(...json.data);
      cursor = json.meta && json.meta.next_cursor;
      if (!cursor) break;
    }
    return all;
  }

  return {
    getTeams: () => request('/teams').then((j) => j.data),
    getAllPlayers: (params = {}) => paginateAll('/players', params),
    getGamesByDate: (dates) => paginateAll('/games', { dates }),
    getGamesBySeason: (seasons, teamIds) =>
      paginateAll('/games', { seasons, team_ids: teamIds }),
    getStatsByGame: (gameIds) => paginateAll('/stats', { game_ids: gameIds }),
    getStatsByDate: (dates) => paginateAll('/stats', { dates }),
    // type: general | clutch | defense | shooting
    getSeasonAverages: ({ type = 'general', season, seasonType = 'regular', playerIds } = {}) =>
      request(`/season_averages/${type}`, {
        season,
        season_type: seasonType,
        type,
        player_ids: playerIds,
      }).then((j) => j.data),
    getStandings: (season) => request('/standings', { season }).then((j) => j.data),
    getLeaders: ({ statType, season, seasonType = 'regular' }) =>
      request('/leaders', { stat_type: statType, season, season_type: seasonType }).then(
        (j) => j.data
      ),
  };
}
