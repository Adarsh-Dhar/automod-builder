#!/usr/bin/env node

/**
 * Standalone test script to call the /api/rule-stage/chat endpoint
 * Tests YAML generation using the Gemini API
 */

const API_KEY = 'AIzaSyD27aiBa5tpGggM_rrU2hvQlps05yffUNo';
const TEST_PROMPT = 'Create a spam rule for posts with "buy" in the title from accounts less than 7 days old';

async function testChatEndpoint() {
  console.log('Testing /api/rule-stage/chat endpoint...');
  console.log('Prompt:', TEST_PROMPT);
  console.log('');

  try {
    const response = await fetch('http://localhost:5173/api/rule-stage/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: TEST_PROMPT,
        history: [],
        subredditContext: '',
        apiKey: API_KEY,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Response status:', data.status);
    console.log('');
    console.log('Generated YAML:');
    console.log('---');
    console.log(data.response);
    console.log('---');
    console.log('');

    // Validate YAML structure
    const yaml = data.response;
    const hasYamlDelimiters = yaml.includes('```yaml') && yaml.includes('```');
    const hasTypeSubmission = yaml.includes('type: submission');
    const hasAction = yaml.includes('action:');
    const hasComment = yaml.includes('comment:');

    console.log('Validation Results:');
    console.log('- Has YAML delimiters:', hasYamlDelimiters);
    console.log('- Has type: submission:', hasTypeSubmission);
    console.log('- Has action:', hasAction);
    console.log('- Has comment:', hasComment);
    console.log('');

    if (hasYamlDelimiters && hasTypeSubmission && hasAction && hasComment) {
      console.log('✅ YAML generation test PASSED');
    } else {
      console.log('❌ YAML generation test FAILED - missing required fields');
    }
  } catch (error) {
    console.error('Error testing chat endpoint:', error.message);
    console.error('Make sure the dev server is running on http://localhost:5173');
    process.exit(1);
  }
}

testChatEndpoint();
