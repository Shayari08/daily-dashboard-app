// test-ollama.js
// Run this to test if Ollama is working

const axios = require('axios');

async function testOllama() {
  console.log('Testing Ollama connection...\n');
  
  try {
    // Test 1: Check if Ollama is running
    console.log('1. Checking if Ollama is running...');
    const healthCheck = await axios.get('http://localhost:11434/api/tags');
    console.log('✓ Ollama is running!');
    console.log('Available models:', healthCheck.data.models.map(m => m.name).join(', '));
    console.log('');
    
    // Test 2: Try to generate a response
    console.log('2. Testing generation...');
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.2',
      prompt: 'Say hello in one sentence.',
      stream: false
    }, {
      timeout: 30000 // 30 second timeout
    });
    
    console.log('✓ Generation works!');
    console.log('Response:', response.data.response);
    console.log('');
    console.log('========================================');
    console.log('✓ Ollama is working correctly!');
    console.log('You can now integrate it with your app.');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n❌ Ollama is not running!');
      console.log('Start it with: ollama serve');
    } else if (error.response?.status === 404) {
      console.log('\n❌ Model not found!');
      console.log('Download it with: ollama pull llama3.2');
    } else {
      console.log('\nFull error:', error);
    }
  }
}

testOllama();