#!/usr/bin/env node

/**
 * Railway Production Start Script
 * This script handles the production deployment for Railway
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting StockTracker App on Railway...');

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log('📦 Production mode detected, using compiled JavaScript');
  
  // Use the compiled JavaScript from dist folder
  const appPath = path.join(__dirname, 'dist', 'app', 'StockTrackerApp.js');
  
  const app = spawn('node', [appPath], {
    stdio: 'inherit',
    env: process.env
  });
  
  app.on('error', (error) => {
    console.error('❌ Failed to start app:', error);
    process.exit(1);
  });
  
  app.on('exit', (code) => {
    console.log(`📊 App exited with code ${code}`);
    process.exit(code);
  });
  
} else {
  console.log('🔧 Development mode detected, using TypeScript');
  
  // Use ts-node for development
  const appPath = path.join(__dirname, 'src', 'app', 'StockTrackerApp.ts');
  
  const app = spawn('npx', ['ts-node', appPath], {
    stdio: 'inherit',
    env: process.env
  });
  
  app.on('error', (error) => {
    console.error('❌ Failed to start app:', error);
    process.exit(1);
  });
  
  app.on('exit', (code) => {
    console.log(`📊 App exited with code ${code}`);
    process.exit(code);
  });
}


