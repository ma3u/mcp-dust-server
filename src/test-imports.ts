// src/test-imports.ts
// Test experimental network imports functionality

console.error('Starting network import test...');
console.error('Node version:', process.version);
console.error('Node path:', process.execPath);
console.error('Command line args:', process.argv);

// Test if experimental network imports are working
import('https://esm.sh/lodash').then(lodash => {
  console.error('Network import succeeded!');
  console.error('Imported module:', Object.keys(lodash));
}).catch(err => {
  console.error('Network import failed:', err);
});

// Also test a simple local import
import('./utils/secure-logger.js').then(logger => {
  console.error('Local import succeeded!');
}).catch(err => {
  console.error('Local import failed:', err);
});

// Keep the process alive for a bit to see the results
setTimeout(() => {
  console.error('Test complete');
  process.exit(0);
}, 5000);
