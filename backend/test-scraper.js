import axios from 'axios';
import cheerio from 'cheerio';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const test = async () => {
  try {
    console.log('Fetching ESPN Cricinfo...');
    const response = await axios.get(
      'https://www.espncricinfo.com/live-cricket-match-schedule-fixtures',
      {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.espncricinfo.com/',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
        timeout: 15000,
      }
    );

    const $ = cheerio.load(response.data);
    
    console.log('\n=== Selector Analysis ===');
    console.log(`[data-testid="match-card"] matches:`, $('[data-testid="match-card"]').length);
    console.log(`div[class*="match"] matches:`, $('div[class*="match"]').length);
    console.log(`[class*="fixture"] matches:`, $('[class*="fixture"]').length);
    console.log(`[class*="upcoming"] matches:`, $('[class*="upcoming"]').length);
    console.log(`Total divs on page:`, $('div').length);
    
    // Log first 5 divs with "match" class to see structure
    console.log('\n=== Sample Match Elements ===');
    $('div[class*="match"]').first(5).each((i, el) => {
      const $el = $(el);
      const classes = $el.attr('class');
      const text = $el.text().substring(0, 100);
      console.log(`Match ${i}: classes="${classes}", text="${text}..."`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
};

test();
