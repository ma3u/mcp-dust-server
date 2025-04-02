// debug-paths.js
// Debug script to verify paths and environment variables

console.error('===== DEBUG PATH INFORMATION =====');
console.error('Current working directory:', process.cwd());
console.error('NODE_PATH:', process.env.NODE_PATH);
console.error('PATH:', process.env.PATH);
console.error('Node executable:', process.execPath);
console.error('Node version:', process.version);

try {
  console.error('Resolved server path:', require.resolve('./dist/server.js'));
} catch (error) {
  console.error('Error resolving server path:', error.message);
  
  // Try alternative path resolution approaches
  try {
    const path = require('path');
    const serverPath = path.resolve(process.cwd(), 'dist/server.js');
    console.error('Absolute server path:', serverPath);
    console.error('File exists:', require('fs').existsSync(serverPath));
  } catch (err) {
    console.error('Error with path resolution:', err.message);
  }
}

// Check if we can access the dist directory
try {
  const fs = require('fs');
  const distContents = fs.readdirSync('./dist');
  console.error('dist directory contents:', distContents);
} catch (error) {
  console.error('Error reading dist directory:', error.message);
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
