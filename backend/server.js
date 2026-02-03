import mongoose from 'mongoose';
import app from './src/app.js';
import ENV from './src/config/env.js';
import { startMatchPollingJob } from './src/jobs/matchPolling.job.js';
import { startStatsPollingJob } from './src/jobs/statsPolling.job.js';

const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(ENV.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');

    // Start server
    app.listen(ENV.PORT, () => {
      console.log(`Server running on port ${ENV.PORT}`);
    });

    // Start background jobs - disabled for debugging
    try {
      startMatchPollingJob();
      startStatsPollingJob();
    } catch (jobError) {
      console.error('Failed to start match polling job:', jobError.message);
      // Don't exit, continue running server without job
    }

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
