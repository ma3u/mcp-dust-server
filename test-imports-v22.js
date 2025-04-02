// test-imports-v22.js
// Test network imports functionality for Node.js v22+

console.error('Starting network import test...');
console.error('Node version:', process.version);
console.error('Node path:', process.execPath);
console.error('Command line args:', process.argv);

// Test if network imports are working
// In Node.js v22+, network imports are enabled with --experimental-network-imports
// or --enable-experimental-web-platform-features
try {
  // Use dynamic import for testing
  import('https://esm.sh/lodash-es').then(lodash => {
    console.error('Network import succeeded!');
    console.error('Imported module:', Object.keys(lodash));
  }).catch(err => {
    console.error('Network import failed:', err);
    console.error('Error details:', err.stack);
  });
} catch (err) {
  console.error('Immediate error with import syntax:', err);
}

// Keep the process alive for a bit to see the results
setTimeout(() => {
  console.error('Test complete');
  process.exit(0);
}, 5000);
