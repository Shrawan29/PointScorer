import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.cricbuzz.com/',
};

const sniff = (data) => {
  const s = typeof data === 'string' ? data : JSON.stringify(data);
  const trimmed = s.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json-ish';
  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) return 'html';
  return trimmed.slice(0, 40);
};

const main = async () => {
  const matchId = process.argv[2] || '145385';
  const candidates = [
    `https://www.cricbuzz.com/api/cricket-match/scorecard/${matchId}`,
    `https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`,
    `https://www.cricbuzz.com/api/cricket-match/livescore/${matchId}`,
    `https://www.cricbuzz.com/api/cricket-match/game-info/${matchId}`,

    `https://www.cricbuzz.com/api/mcenter/v1/${matchId}/scard`,
    `https://www.cricbuzz.com/api/mcenter/v1/${matchId}/comm`,
    `https://www.cricbuzz.com/api/mcenter/v1/${matchId}`,

    `https://m.cricbuzz.com/api/cricket-match/scorecard/${matchId}`,
    `https://m.cricbuzz.com/api/cricket-match/commentary/${matchId}`,
    `https://m.cricbuzz.com/api/mcenter/v1/${matchId}/scard`,
    `https://m.cricbuzz.com/api/mcenter/v1/${matchId}/comm`,
    `https://m.cricbuzz.com/api/mcenter/v1/${matchId}`,

    // Some observed patterns from third-party wrappers
    `https://www.cricbuzz.com/api/cricket-match/scorecard/v1/${matchId}`,
    `https://www.cricbuzz.com/api/mcenter/v1/${matchId}/scard?platform=web`,
  ];

  for (const url of candidates) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000, validateStatus: () => true });
      const ct = res.headers['content-type'] || '';
      const kind = sniff(res.data);
      const len = typeof res.data === 'string' ? res.data.length : JSON.stringify(res.data).length;
      console.log(`${res.status} ${ct} ${len} ${kind} :: ${url}`);
      if (kind === 'json-ish' && typeof res.data === 'string') {
        // quick key peek
        const first = res.data.slice(0, 200);
        console.log(`  head: ${first.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`ERR ${url}: ${e?.message || e}`);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
