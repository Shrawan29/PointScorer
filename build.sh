#!/bin/bash
# Build frontend
cd frontend
npm install
npm run build
cd ..

# Install backend dependencies
cd backend
npm install
cd ..

echo "Build complete! Frontend dist is ready at frontend/dist"
