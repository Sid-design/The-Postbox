// Simple test script to verify mobile app API connectivity to Railway backend
const axios = require('axios');

const API_URL = 'https://the-postbox-production.up.railway.app';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

async function testConnectivity() {
  try {
    console.log('🧪 Testing Complete Newsletter Reader Flow...\n');

    // 1. Test basic connectivity
    console.log('1️⃣ Testing basic connectivity...');
    const testResponse = await apiClient.get('/test');
    console.log('✅ Basic connectivity: PASSED');
    console.log('   Response:', testResponse.data);
    console.log('');

    // 2. Test newsletter discovery (no auth required)
    console.log('2️⃣ Testing newsletter discovery...');
    const newslettersResponse = await apiClient.get('/api/newsletters');
    console.log(`✅ Newsletter discovery: PASSED (${newslettersResponse.data.length} newsletters found)`);
    if (newslettersResponse.data.length > 0) {
      console.log(`📧 Sample newsletter: ${newslettersResponse.data[0].name} (${newslettersResponse.data[0].email})`);
    }
    console.log('');

    // 3. Test authentication endpoints (should fail gracefully without tokens)
    console.log('3️⃣ Testing authentication error handling...');
    try {
      await apiClient.get('/api/messages');
      console.log('❌ Auth test: FAILED (should have required authentication)');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Authentication error handling: PASSED (401 Unauthorized as expected)');
      } else {
        console.log('⚠️ Auth test: Unexpected error:', error.message);
      }
    }
    console.log('');

    // 4. Test health endpoint
    console.log('4️⃣ Testing health endpoint...');
    const healthResponse = await apiClient.get('/health');
    console.log('✅ Health check: PASSED');
    console.log('   Status:', healthResponse.data);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('📱 Mobile app should work correctly with these endpoints.');

  } catch (error) {
    console.error('❌ Flow test failed:', error.message);
    console.log('🔧 Check the error details above to identify issues.');
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  }
}

testConnectivity();

