import mongoose from 'mongoose';
import axios from 'axios';
import { createServer } from 'http';
import app from './src/app.js';
import ENV from './src/config/env.js';
import { startMatchPollingJob } from './src/jobs/matchPolling.job.js';
import { startStatsPollingJob } from './src/jobs/statsPolling.job.js';
import { initializeLiveRoomRealtime } from './src/services/liveRoomRealtime.service.js';

let selfPingTimer = null;

const startSelfPing = () => {
  if (!ENV.SELF_PING_ENABLED) {
    return;
  }

  if (!ENV.SELF_PING_BASE_URL) {
    console.warn('[SelfPing] Disabled: SELF_PING_BASE_URL/RENDER_EXTERNAL_URL is missing.');
    return;
  }

  const baseUrl = ENV.SELF_PING_BASE_URL.replace(/\/$/, '');
  const path = ENV.SELF_PING_PATH.startsWith('/')
    ? ENV.SELF_PING_PATH
    : `/${ENV.SELF_PING_PATH}`;
  const pingUrl = `${baseUrl}${path}`;
  const intervalMs = ENV.SELF_PING_INTERVAL_MINUTES * 60 * 1000;

  const ping = async () => {
    try {
      await axios.get(pingUrl, {
        timeout: ENV.SELF_PING_TIMEOUT_MS,
        headers: {
          'User-Agent': 'pointscorer-self-ping/1.0',
        },
      });
      console.log(`[SelfPing] OK ${pingUrl}`);
    } catch (error) {
      console.warn(`[SelfPing] Failed ${pingUrl}: ${error.message}`);
    }
  };

  // Prime once shortly after boot, then continue at the configured cadence.
  setTimeout(ping, 30_000);
  selfPingTimer = setInterval(ping, intervalMs);

  console.log(
    `[SelfPing] Enabled every ${ENV.SELF_PING_INTERVAL_MINUTES} min -> ${pingUrl}`,
  );
};

const startServer = async () => {
  try {
    // Start HTTP server immediately so Railway can health-check it,
    // even if MongoDB is temporarily unavailable.
	const port = ENV.PORT;
	const host = process.env.HOST || '0.0.0.0';
  const httpServer = createServer(app);
  initializeLiveRoomRealtime(httpServer);
  httpServer.listen(port, host, () => {
		console.log(`Server running on ${host}:${port}`);
		console.log(`[Env] PORT=${process.env.PORT || ''} HOST=${process.env.HOST || ''}`);
    startSelfPing();
	});

    let jobsStarted = false;
    const connectWithRetry = async () => {
      try {
        await mongoose.connect(ENV.MONGO_URI, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log('Connected to MongoDB');

        if (!jobsStarted) {
          try {
            startMatchPollingJob();
            startStatsPollingJob();
            jobsStarted = true;
          } catch (jobError) {
            console.error('Failed to start background jobs:', jobError.message);
          }
        }
      } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        setTimeout(connectWithRetry, 10_000);
      }
    };

    connectWithRetry();

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[Server] Uncaught Exception:', error.message);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('SIGTERM', () => {
      if (selfPingTimer) clearInterval(selfPingTimer);
    });

    process.on('SIGINT', () => {
      if (selfPingTimer) clearInterval(selfPingTimer);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
