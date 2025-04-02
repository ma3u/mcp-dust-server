// debug-paths.mjs
// Debug script to verify paths and environment variables (ESM version)

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readdirSync, existsSync } from 'fs';

console.error('===== DEBUG PATH INFORMATION =====');
console.error('Current working directory:', process.cwd());
console.error('NODE_PATH:', process.env.NODE_PATH);
console.error('PATH:', process.env.PATH);
console.error('Node executable:', process.execPath);
console.error('Node version:', process.version);

try {
  // ESM equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  const serverPath = resolve(process.cwd(), 'dist/server.js');
  console.error('Absolute server path:', serverPath);
  console.error('File exists:', existsSync(serverPath));
  
  // Check if we can access the dist directory
  try {
    const distContents = readdirSync('./dist');
    console.error('dist directory contents:', distContents);
  } catch (error) {
    console.error('Error reading dist directory:', error.message);
  }
  
  // Check server.js specifically
  try {
    const serverJsStats = existsSync('./dist/server.js');
    console.error('server.js exists:', serverJsStats);
  } catch (error) {
    console.error('Error checking server.js:', error.message);
  }
  
} catch (error) {
  console.error('Error with path resolution:', error.message);
}

// Log all environment variables
console.error('===== ENVIRONMENT VARIABLES =====');
Object.keys(process.env).forEach(key => {
  // Mask sensitive values
  const value = key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') 
    ? '***' + (process.env[key]?.slice(-4) || '')
    : process.env[key];
  console.error(`${key}:`, value);
});
console.error('=================================');
