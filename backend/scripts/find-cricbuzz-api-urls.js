import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/scorecard`;
  const res = await axios.get(url, { headers: HEADERS, validateStatus: () => true, timeout: 15000 });
  const html = String(res.data || '');
  console.log('status', res.status, 'len', html.length);

  const re = /https?:\/\/www\.cricbuzz\.com\/api\/[^"'\s<>]+/g;
  const found = new Set();
  for (const m of html.matchAll(re)) found.add(m[0]);

  console.log('api urls count', found.size);
  console.log('first 30:', Array.from(found).slice(0, 30));

  const re2 = /\/api\/[^"'\s<>]+/g;
  const rel = new Set();
  for (const m of html.matchAll(re2)) rel.add(m[0]);
  console.log('relative /api/* count', rel.size);
  console.log('relative first 30:', Array.from(rel).slice(0, 30));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
