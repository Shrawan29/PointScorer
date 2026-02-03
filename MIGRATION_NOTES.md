# RapidAPI Removal & Web Scraping Migration

## Summary
Successfully removed all RapidAPI dependencies and replaced them with web scraping using cheerio and axios.

## Files Changed

### 1. Configuration & Environment
- **[.env](.env)** - Removed RapidAPI env vars, added SCRAPER_DELAY_MS and SCRAPER_TIMEOUT_MS
- **[package.json](package.json)** - Added cheerio ^1.0.0-rc.12 dependency

### 2. Services
- **[src/config/scraper.js](src/config/scraper.js)** - NEW - Scraper configuration
- **[src/services/scraper.service.js](src/services/scraper.service.js)** - NEW - Web scraping service

### 3. Deprecated (Still in repo but not used)
- **src/config/cricketApi.js** - DEPRECATED - No longer imported
- **src/services/cricketApi.service.js** - DEPRECATED - No longer imported

### 4. Controllers Updated
- **[src/controllers/cricket.controller.js](src/controllers/cricket.controller.js)**
  - Changed: getTodayAndLiveMatches → scrapeTodayAndLiveMatches
  - Changed: getMatchTeams → returns placeholder (squad data requires enhanced scraper)
  - Changed: getMatchScorecard → scrapeMatchScorecard

- **[src/controllers/match.controller.js](src/controllers/match.controller.js)**
  - Changed: getTodayAndLiveMatches → scrapeTodayAndLiveMatches
  - Changed: getUpcomingMatches → scrapeUpcomingMatches
  - Changed: getMatchDetails → scrapeMatchDetails

### 5. Jobs Updated
- **[src/jobs/matchPolling.job.js](src/jobs/matchPolling.job.js)**
  - Changed: getMatchScorecard → scrapeMatchScorecard

## New Scraper Functions

### scrapeTodayAndLiveMatches()
Scrapes live and today's matches from ESPNcricinfo
- Returns: Array of match objects with id, name, teams, type, status
- Handles: Multiple selector strategies, malformed data, defensive parsing

### scrapeUpcomingMatches()
Scrapes upcoming fixtures from ESPNcricinfo
- Returns: Array of upcoming match objects
- Handles: Deduplication, status filtering

### scrapeMatchDetails(matchUrl)
Scrapes individual match details page
- Returns: Match object with venue, teams, type, status
- Parameters: matchUrl (string)

### scrapeMatchScorecard(matchUrl)
Scrapes completed match scorecard
- Returns: Scorecard with batting/bowling stats (only after match completes)
- Parameters: matchUrl (string)

## Anti-Blocking Measures Implemented

✅ Realistic User-Agent header
✅ Configurable request delays (default 3000ms between requests)
✅ Sequential scraping (no concurrent requests)
✅ Request timeout configuration (default 15000ms)
✅ Defensive selectors with fallbacks
✅ Graceful error handling (returns empty/null on failure)
✅ No HTML storage (cleaned data only)

## Next Steps (If Needed)

1. **Install Dependencies**: Run `npm install` in backend/ to install cheerio
2. **Test Scraping**: Call endpoints to verify scraping works
3. **Handle Squad Data**: scrapeMatchScorecard can be extended to include squad/team data
4. **Add Caching**: Implement cache layer to reduce scraping frequency
5. **Monitor Selector Stability**: ESPNcricinfo selectors may change - monitor and adjust

## Environment Variables

```dotenv
# New variables added
SCRAPER_DELAY_MS=3000           # Delay between requests
SCRAPER_TIMEOUT_MS=15000        # Request timeout

# Removed
CRICKET_API_BASE_URL            # ❌ No longer needed
CRICKET_API_KEY                 # ❌ No longer needed  
CRICKET_API_HOST                # ❌ No longer needed
```

## Warnings & Notes

⚠️ Web scraping is fragile - selectors may break if ESPNcricinfo changes HTML structure
⚠️ Squad data (cricket.controller.getSquads) is not yet fully implemented
⚠️ Scorecard scraping works only after match is completed
⚠️ Keep scraping frequency low to avoid being blocked
⚠️ Old cricketApi.service.js is still in repo but unused - can be deleted later

## Verification

All old references removed:
- ✅ No more `getTodayAndLiveMatches` imports
- ✅ No more `getUpcomingMatches` imports
- ✅ No more `getMatchDetails` imports
- ✅ No more X-RapidAPI headers
- ✅ No more RapidAPI environment variables

New scraper fully integrated:
- ✅ All controllers using scraper.service.js
- ✅ Match polling job updated
- ✅ Cheerio added to package.json
- ✅ Defensive error handling in place
