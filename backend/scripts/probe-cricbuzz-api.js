import axios from 'axios';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const paths = [
  (id) => `https://www.cricbuzz.com/api/cricket-match/scorecard/${id}`,
  (id) => `https://www.cricbuzz.com/api/cricket-match/commentary/${id}`,
  (id) => `https://www.cricbuzz.com/api/cricket-match/${id}`,
  (id) => `https://www.cricbuzz.com/api/cricket-scorecard/${id}`,
  (id) => `https://www.cricbuzz.com/api/match/${id}/scorecard`,
  (id) => `https://www.cricbuzz.com/api/cricket-match/${id}/scorecard`,
];

const main = async () => {
  const matchId = process.argv[2] || '145385';
  for (const fn of paths) {
    const url = fn(matchId);
    try {
      const res = await axios.get(url, { headers, validateStatus: () => true, timeout: 15000 });
      const kind = typeof res.data;
      const preview =
        kind === 'object' && res.data
          ? Object.keys(res.data).slice(0, 12)
          : String(res.data || '').slice(0, 120);
      console.log(url, res.status, preview);
    } catch (e) {
      console.log(url, 'ERR', e.message);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
