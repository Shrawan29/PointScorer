import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const main = async () => {
  const id = String(process.argv[2] || '145385');

  const urls = [
    `https://m.cricbuzz.com/live-cricket-scores/${id}/scorecard`,
    `https://m.cricbuzz.com/cricket-scores/${id}/scorecard`,
    `https://m.cricbuzz.com/live-cricket-scores/${id}`,

    `https://www.cricbuzz.com/api/cricket-scorecard/${id}`,
    `https://www.cricbuzz.com/api/cricket-scorecard/${id}.json`,
    `https://www.cricbuzz.com/api/cricket-match/commentary/${id}`,
    `https://www.cricbuzz.com/api/cricket-match/commentary/${id}.json`,
    `https://www.cricbuzz.com/api/cricket-match/${id}/scorecard`,
    `https://www.cricbuzz.com/api/cricket-match/${id}/scorecard.json`,
    `https://www.cricbuzz.com/api/cricket-scorecard/${id}/scorecard`,
    `https://www.cricbuzz.com/api/cricket-scorecard/${id}/full-scorecard`,
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000,
        validateStatus: () => true,
      });

      const ct = String(res.headers?.['content-type'] || '');
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

      console.log('\n', res.status, ct, url);
      console.log(body.slice(0, 240).replace(/\s+/g, ' '));
    } catch (e) {
      console.log('\nERR', url, e?.message);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
