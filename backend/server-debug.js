import mongoose from 'mongoose';
import app from './src/app.js';
import ENV from './src/config/env.js';

const startServer = async () => {
  try {
    // Add logging to catch ALL errors
    process.on('uncaughtException', (error) => {
      console.error('[UNCAUGHT EXCEPTION]', error);
      console.error(error.stack);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[UNHANDLED REJECTION]', reason);
      if (reason && typeof reason === 'object' && reason.stack) {
        console.error(reason.stack);
      }
    });

    // Connect to MongoDB
    await mongoose.connect(ENV.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');

    // Start server
    const server = app.listen(ENV.PORT, () => {
      console.log(`Server running on port ${ENV.PORT}`);
    });

    // Keep server running
    server.on('error', (error) => {
      console.error('[SERVER ERROR]', error);
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

startServer();
