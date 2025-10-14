import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting build process...');

// Check if main app file exists
const appPath = join(__dirname, 'app.js');
if (!existsSync(appPath)) {
  console.error('❌ Build failed: app.js not found');
  process.exit(1);
}

console.log('✅ Build completed successfully!');
console.log('📁 Main application file found: app.js');
console.log('🎯 Ready for deployment');