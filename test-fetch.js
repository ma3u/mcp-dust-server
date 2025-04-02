// test-fetch.js
// Test fetch API functionality which is available in Node.js v22+

console.error('Starting fetch API test...');
console.error('Node version:', process.version);
console.error('Node path:', process.execPath);
console.error('Command line args:', process.argv);
console.error('Environment variables:', {
  NODE_PATH: process.env.NODE_PATH,
  PATH: process.env.PATH,
  NVM_DIR: process.env.NVM_DIR
});

// Test if fetch API is working (available by default in Node.js v22+)
try {
  fetch('https://esm.sh/lodash-es')
    .then(response => {
      console.error('Fetch succeeded!');
      console.error('Response status:', response.status);
      console.error('Response headers:', response.headers);
      return response.text();
    })
    .then(text => {
      console.error('Response body length:', text.length);
      console.error('Response body preview:', text.substring(0, 100) + '...');
    })
    .catch(err => {
      console.error('Fetch failed:', err);
      console.error('Error details:', err.stack);
    });
} catch (err) {
  console.error('Immediate error with fetch syntax:', err);
}

// Keep the process alive for a bit to see the results
setTimeout(() => {
  console.error('Test complete');
  process.exit(0);
}, 5000);
