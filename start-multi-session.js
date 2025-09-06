#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting WAHA CORE Multi-Session Implementation');
console.log('=' .repeat(60));

// Check requirements
console.log('🔍 Checking requirements...');

// Check if Docker is running
try {
  execSync('docker --version', { stdio: 'ignore' });
  console.log('✅ Docker is available');
} catch (error) {
  console.error('❌ Docker is not available or not running');
  console.log('Please install Docker and make sure it\'s running');
  process.exit(1);
}

// Check if dist folder exists
if (!fs.existsSync('./dist')) {
  console.log('📦 Building application...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Application built successfully');
  } catch (error) {
    console.error('❌ Build failed');
    process.exit(1);
  }
} else {
  console.log('✅ Application already built');
}

// Setup dashboard if needed
console.log('🎨 Setting up dashboard...');
try {
  execSync('node setup-dashboard.js', { stdio: 'inherit' });
} catch (error) {
  console.log('⚠️  Dashboard setup failed, but continuing...');
}

// Stop existing container if running
console.log('🛑 Stopping existing container...');
try {
  execSync('docker stop waha-multi-session 2>/dev/null || true', { stdio: 'ignore' });
  execSync('docker rm waha-multi-session 2>/dev/null || true', { stdio: 'ignore' });
  console.log('✅ Cleaned up existing container');
} catch (error) {
  // Ignore errors here
}

// Start the container
console.log('🐳 Starting WAHA Multi-Session container...');
try {
  execSync('docker-compose -f docker-compose.multi-session.yaml up -d', { stdio: 'inherit' });
  console.log('✅ Container started successfully');
} catch (error) {
  console.error('❌ Failed to start container');
  process.exit(1);
}

// Wait for container to be ready
console.log('⏳ Waiting for WAHA to be ready...');
let ready = false;
let attempts = 0;
const maxAttempts = 30;

while (!ready && attempts < maxAttempts) {
  try {
    execSync('curl -s -f http://localhost:3000/api/version', { stdio: 'ignore' });
    ready = true;
  } catch (error) {
    attempts++;
    console.log(`   Attempt ${attempts}/${maxAttempts}...`);
    // Sleep for 2 seconds
    execSync('sleep 2', { stdio: 'ignore' });
  }
}

if (ready) {
  console.log('🎉 WAHA Multi-Session is ready!');
  console.log('=' .repeat(60));
  console.log('');
  console.log('🌐 Access URLs:');
  console.log('   Dashboard:  http://localhost:3000/dashboard/');
  console.log('   API Docs:   http://localhost:3000/docs');
  console.log('   Version:    http://localhost:3000/api/version');
  console.log('');
  console.log('📚 Multi-Session API Examples:');
  console.log('   # Create sessions');
  console.log('   curl -X POST http://localhost:3000/api/sessions -d \'{"name": "business"}\'');
  console.log('   curl -X POST http://localhost:3000/api/sessions -d \'{"name": "personal"}\'');
  console.log('');
  console.log('   # List all sessions');
  console.log('   curl http://localhost:3000/api/sessions?all=true');
  console.log('');
  console.log('   # Start a session');
  console.log('   curl -X POST http://localhost:3000/api/sessions/business/start');
  console.log('');
  console.log('🔧 Management:');
  console.log('   View logs:    docker logs waha-multi-session');
  console.log('   Stop:         docker stop waha-multi-session');
  console.log('   Restart:      docker restart waha-multi-session');
  console.log('');
  console.log('🎊 WAHA CORE Multi-Session Implementation is now running!');
  
} else {
  console.error('❌ WAHA failed to start after 60 seconds');
  console.log('');
  console.log('🔧 Troubleshooting:');
  console.log('   Check logs: docker logs waha-multi-session');
  console.log('   Check container: docker ps -a');
  process.exit(1);
}