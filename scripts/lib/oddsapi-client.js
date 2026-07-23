const BASE_URL = 'https://api.the-odds-api.com/v4/sports/basketball_nba';

export class OddsApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'OddsApiError';
    this.status = status;
  }
}

export function createClient({ apiKey, regions = 'eu,uk', markets = 'h2h,spreads,totals', oddsFormat = 'decimal' } = {}) {
  async function getOdds() {
    if (!apiKey) throw new OddsApiError('Falta ODDS_API_KEY', 401);

    const url = new URL(`${BASE_URL}/odds`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', regions);
    url.searchParams.set('markets', markets);
    url.searchParams.set('oddsFormat', oddsFormat);
    url.searchParams.set('dateFormat', 'iso');

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new OddsApiError(`odds api -> ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    return res.json();
  }

  return { getOdds };
}
