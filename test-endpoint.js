import axios from 'axios';

async function testEndpoint() {
  try {
    console.log('Testing /api/generate-product-description endpoint...');
    
    const response = await axios.post('http://localhost:3001/api/generate-product-description', {
      productName: 'Test Product',
      brand: 'Test Brand', 
      features: 'Test features for testing'
    }, {
      timeout: 10000 // 10 second timeout
    });
    
    console.log('Response received:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
  } catch (error) {
    console.error('Error occurred:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testEndpoint();