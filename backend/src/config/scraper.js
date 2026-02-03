// Scraper configuration
// No longer uses RapidAPI - uses web scraping instead

const SCRAPER_CONFIG = {
	// Delay between scraping requests (ms)
	DELAY_MS: Number(process.env.SCRAPER_DELAY_MS || 3000),
	
	// Request timeout (ms)
	TIMEOUT_MS: Number(process.env.SCRAPER_TIMEOUT_MS || 15000),
	
	// User-Agent header
	USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
	
	// Target websites
	WEBSITES: {
		ESPNCRICINFO: 'https://www.espncricinfo.com',
		CRICBUZZ: 'https://www.cricbuzz.com',
	},
};

export default SCRAPER_CONFIG;
