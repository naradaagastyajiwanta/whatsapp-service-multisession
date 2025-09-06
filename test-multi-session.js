#!/usr/bin/env node

const axios = require('axios');

const WAHA_URL = process.env.WAHA_URL || 'http://localhost:3000';
const API_KEY = process.env.WAHA_API_KEY || '';

const headers = API_KEY ? { 'X-Api-Key': API_KEY } : {};

async function testMultiSession() {
  console.log('🚀 Testing WAHA CORE Multi-Session Implementation');
  console.log('Base URL:', WAHA_URL);
  
  try {
    // Test 1: Create multiple sessions
    console.log('\n1. Creating multiple sessions...');
    
    const sessions = ['session1', 'session2', 'session3'];
    
    for (const sessionName of sessions) {
      try {
        const response = await axios.post(`${WAHA_URL}/api/sessions`, {
          name: sessionName,
          start: false
        }, { headers });
        
        console.log(`✅ Session '${sessionName}' created successfully:`, response.data.name);
      } catch (error) {
        console.error(`❌ Failed to create session '${sessionName}':`, error.response?.data || error.message);
      }
    }
    
    // Test 2: List all sessions
    console.log('\n2. Listing all sessions...');
    try {
      const response = await axios.get(`${WAHA_URL}/api/sessions?all=true`, { headers });
      console.log('📋 Sessions found:', response.data.length);
      response.data.forEach(session => {
        console.log(`   - ${session.name}: ${session.status}`);
      });
    } catch (error) {
      console.error('❌ Failed to list sessions:', error.response?.data || error.message);
    }
    
    // Test 3: Get individual session info
    console.log('\n3. Getting individual session info...');
    for (const sessionName of sessions) {
      try {
        const response = await axios.get(`${WAHA_URL}/api/sessions/${sessionName}`, { headers });
        console.log(`📄 Session '${sessionName}' info:`, {
          name: response.data.name,
          status: response.data.status,
          hasConfig: !!response.data.config
        });
      } catch (error) {
        console.error(`❌ Failed to get session '${sessionName}' info:`, error.response?.data || error.message);
      }
    }
    
    // Test 4: Update session configuration
    console.log('\n4. Updating session configurations...');
    try {
      const response = await axios.put(`${WAHA_URL}/api/sessions/session1`, {
        config: {
          debug: true,
          metadata: {
            'test': 'multi-session-test',
            'timestamp': new Date().toISOString()
          }
        }
      }, { headers });
      
      console.log(`✅ Session 'session1' updated successfully`);
    } catch (error) {
      console.error(`❌ Failed to update session 'session1':`, error.response?.data || error.message);
    }
    
    // Test 5: Test session existence
    console.log('\n5. Testing session existence...');
    const testNames = ['session1', 'session2', 'non-existent-session'];
    
    for (const sessionName of testNames) {
      try {
        const response = await axios.get(`${WAHA_URL}/api/sessions/${sessionName}`, { headers });
        console.log(`✅ Session '${sessionName}' exists`);
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`⚠️  Session '${sessionName}' does not exist (expected for non-existent-session)`);
        } else {
          console.error(`❌ Error checking session '${sessionName}':`, error.response?.data || error.message);
        }
      }
    }
    
    // Test 6: Clean up - Delete sessions
    console.log('\n6. Cleaning up sessions...');
    for (const sessionName of sessions) {
      try {
        await axios.delete(`${WAHA_URL}/api/sessions/${sessionName}`, { headers });
        console.log(`🗑️  Session '${sessionName}' deleted successfully`);
      } catch (error) {
        console.error(`❌ Failed to delete session '${sessionName}':`, error.response?.data || error.message);
      }
    }
    
    console.log('\n🎉 Multi-session test completed!');
    
  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
  }
}

if (require.main === module) {
  testMultiSession();
}

module.exports = { testMultiSession };