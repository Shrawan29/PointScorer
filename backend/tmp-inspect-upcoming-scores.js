import axios from 'axios';
import cheerio from 'cheerio';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const url = 'https://www.cricbuzz.com/cricket-scores/upcoming-scores';
const r = await axios.get(url, { headers, validateStatus: () => true });
const html = typeof r.data === 'string' ? r.data : '';
console.log('status', r.status, 'len', html.length);

const $ = cheerio.load(html);
const a = $('a[href*="/live-cricket-scores/"], a[href*="/cricket-scores/"]')
  .filter((_, el) => /\/(live-)?cricket-scores\/\d+\//.test(String(el.attribs?.href || '')))
  .first();

console.log('first href', a.attr('href'));
console.log('first text', a.text().replace(/\s+/g, ' ').trim());

let cur = a;
for (let i = 0; i < 7; i += 1) {
  const parent = cur.parent();
  if (!parent || parent.length === 0) break;
  const cls = parent.attr('class') || '';
  const tag = parent[0]?.tagName;
  const text = parent.text().replace(/\s+/g, ' ').trim();
  console.log(`parent[${i}] <${tag}> class="${cls}" len=${text.length} textSnippet=${text.slice(0,120)}`);
  cur = parent;
}

// Try to find a nearby date/time label
const container = a.closest('div');
const prevText = container.prevAll().first().text().replace(/\s+/g, ' ').trim();
console.log('prev sibling text snippet:', prevText.slice(0, 200));
