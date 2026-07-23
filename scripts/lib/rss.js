import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 });

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

export async function fetchNews(feeds, { limit = 10 } = {}) {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const parsed = await withTimeout(parser.parseURL(feed.url), 15000);
      return (parsed.items || []).map((item) => ({
        title: item.title?.trim() || 'Sin titulo',
        link: item.link,
        source: feed.name,
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        excerpt: truncate(stripHtml(item.contentSnippet || item.content || item.summary || '')),
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

  return deduped.slice(0, limit);
}
