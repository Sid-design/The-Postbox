#!/usr/bin/env node
// Railway startup script
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Starting Newsletter Reader Backend...');
console.log('Current working directory:', process.cwd());
console.log('Directory contents:', fs.readdirSync('.'));

// Check if backend directory exists
const backendPath = path.join(__dirname, 'backend');
console.log('Looking for backend at:', backendPath);

if (fs.existsSync(backendPath)) {
  console.log('Backend directory found, changing to it...');
  process.chdir(backendPath);
  console.log('New working directory:', process.cwd());
} else {
  console.log('Backend directory not found at expected path');
  console.log('Available directories:', fs.readdirSync(__dirname));
  process.exit(1);
}

// Start the backend server
console.log('Starting backend server...');
const backend = spawn('node', ['index-postgres.js'], {
  stdio: 'inherit',
  shell: false
});

backend.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
  process.exit(code);
});

backend.on('error', (err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
