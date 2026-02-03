// Test scraper directly
import { scrapeTodayAndLiveMatches, scrapeUpcomingMatches } from './src/services/scraper.service.js';

console.log('Testing scraper...');

try {
  const today = await scrapeTodayAndLiveMatches();
  console.log('Today matches:', today?.length);

  const upcoming = await scrapeUpcomingMatches();
  console.log('Upcoming matches:', upcoming?.length);

  console.log('Scraper test completed successfully!');
} catch (error) {
  console.error('Scraper test error:', error);
  process.exit(1);
}
