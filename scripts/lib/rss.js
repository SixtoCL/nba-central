import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 });

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Some feeds (WordPress-based ones especially) serve smart quotes/dashes
// that were UTF-8 encoded, then misread as Windows-1252 and re-encoded to
// UTF-8 again server-side, e.g. an apostrophe becomes "â€™". Reversing that
// specific corruption recovers the original character.
const CP1252_TO_BYTE = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
  '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
  'ž': 0x9E, 'Ÿ': 0x9F,
};

function repairMojibake(str) {
  if (!/[ÂÃâ€]/.test(str)) return str;
  const bytes = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 0x100) bytes.push(code);
    else if (CP1252_TO_BYTE[ch] !== undefined) bytes.push(CP1252_TO_BYTE[ch]);
    else return str;
  }
  const repaired = Buffer.from(bytes).toString('utf-8');
  return repaired.includes('�') ? str : repaired;
}

function truncate(text, maxLen = 220) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).replace(/\s+\S*$/, '')}…`;
}

// Fetches every feed, normalizes items, sorts by date and returns the most
// recent `limit` items. Feeds that fail (timeout, 404, invalid XML) are
// skipped rather than failing the whole run.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout tras ${ms}ms`)), ms)),
  ]);
}

// rss-parser's own URL fetcher sometimes mis-decodes UTF-8 (mojibake like
// "a€™" instead of an apostrophe) on feeds that don't set a fully explicit
// charset. Fetching the bytes ourselves and decoding as UTF-8 before handing
// the string to rss-parser sidesteps that.
async function fetchFeedText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; NBACentralBot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

export async function fetchNews(feeds, { limit = 10, maxPerSource = 4 } = {}) {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const text = await withTimeout(fetchFeedText(feed.url), 15000);
      const parsed = await parser.parseString(text);
      return (parsed.items || []).map((item) => ({
        title: repairMojibake(stripHtml(item.title || '')) || 'Sin titulo',
        link: item.link,
        source: feed.name,
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        excerpt: repairMojibake(truncate(stripHtml(item.contentSnippet || item.content || item.summary || ''))),
      }));
    })
  );

  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }

  const seenLinks = new Set();
  const deduped = items.filter((item) => {
    if (!item.link || seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    return true;
  });

  deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Cap items per source so one very active feed doesn't crowd out the rest.
  const perSourceCount = {};
  const balanced = [];
  for (const item of deduped) {
    const count = perSourceCount[item.source] || 0;
    if (count >= maxPerSource) continue;
    perSourceCount[item.source] = count + 1;
    balanced.push(item);
    if (balanced.length >= limit) break;
  }

  return balanced;
}
