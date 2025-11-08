#!/usr/bin/env node

/**
 * RENDER INITIALIZATION RUNNER
 * Standalone script for Render deployment
 */

import initializeRenderDatabase from './render-init.js';

console.log('🔄 [RENDER] Starting database initialization...');

initializeRenderDatabase()
  .then(() => {
    console.log('✅ [RENDER] Database initialization completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ [RENDER] Database initialization failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });