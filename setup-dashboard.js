#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎨 Setting up WAHA Dashboard for Multi-Session Implementation');

const dashboardDir = path.join(__dirname, 'dist', 'dashboard');

// Check if dashboard is already set up
if (fs.existsSync(path.join(dashboardDir, 'index.html'))) {
  console.log('✅ Dashboard already set up!');
  console.log('🌐 Access at: http://localhost:3000/dashboard/');
  process.exit(0);
}

console.log('📥 Copying dashboard files from WAHA image...');

try {
  // Ensure dashboard directory exists
  if (!fs.existsSync(dashboardDir)) {
    console.log('📁 Creating dashboard directory...');
    fs.mkdirSync(dashboardDir, { recursive: true });
  }

  // Copy dashboard files from official WAHA image
  const copyCommand = `docker run --rm -v "${dashboardDir.replace(/\\/g, '/')}:/tmp/dashboard" devlikeapro/waha:latest sh -c "cp -r /app/dist/dashboard/* /tmp/dashboard/"`;
  
  console.log('⏳ Executing copy command...');
  execSync(copyCommand, { stdio: 'inherit' });
  
  // Verify dashboard was copied
  if (fs.existsSync(path.join(dashboardDir, 'index.html'))) {
    console.log('✅ Dashboard files copied successfully!');
    console.log('');
    console.log('🌐 Dashboard URLs:');
    console.log('   Main: http://localhost:3000/dashboard/');
    console.log('   Sessions: http://localhost:3000/dashboard/Sessions');
    console.log('   Login: http://localhost:3000/dashboard/Login');
    console.log('');
    console.log('📋 Dashboard Features:');
    console.log('   • Multi-session management UI');
    console.log('   • Session status monitoring'); 
    console.log('   • QR code scanning interface');
    console.log('   • Real-time session events');
    console.log('   • Configuration management');
    console.log('');
    console.log('🎉 Dashboard setup complete!');
  } else {
    console.error('❌ Dashboard copy failed - index.html not found');
    process.exit(1);
  }

} catch (error) {
  console.error('💥 Error setting up dashboard:', error.message);
  console.log('');
  console.log('🔧 Troubleshooting:');
  console.log('   1. Make sure Docker is running');
  console.log('   2. Ensure you have access to devlikeapro/waha:latest image');
  console.log('   3. Try: docker pull devlikeapro/waha:latest');
  console.log('   4. Check directory permissions');
  process.exit(1);
}