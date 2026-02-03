import mongoose from 'mongoose';
import app from './src/app.js';
import ENV from './src/config/env.js';
import { startMatchPollingJob } from './src/jobs/matchPolling.job.js';
import { startStatsPollingJob } from './src/jobs/statsPolling.job.js';

const startServer = async () => {
  try {
    // Start HTTP server immediately so Railway can health-check it,
    // even if MongoDB is temporarily unavailable.
    app.listen(ENV.PORT, () => {
      console.log(`Server running on port ${ENV.PORT}`);
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
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
