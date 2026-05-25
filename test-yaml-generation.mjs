#!/usr/bin/env node

/**
 * Direct test of YAML generation using Gemini API
 * Tests the AUTOMOD_SYSTEM_PROMPT with real AI
 */

const GEMINI_API_KEY = 'AIzaSyD27aiBa5tpGggM_rrU2hvQlps05yffUNo';
const TEST_PROMPT = 'Create a spam rule for posts with "buy" in the title from accounts less than 7 days old';

// Mock the Devvit modules since we're running outside the Devvit environment
const mockRedis = {
  get: async () => undefined,
  set: async () => 'OK',
};

const mockReddit = {
  getWikiPage: async () => { throw new Error('wiki unavailable'); },
};

const mockContext = {
  subredditName: 'test_subreddit',
};

// Create a simple fetch implementation for Gemini
async function generateTextWithGemini(input, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: input
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// The AUTOMOD_SYSTEM_PROMPT from rule-stage.ts
const AUTOMOD_SYSTEM_PROMPT = `You are an AutoModerator rule assistant. Follow the user's EXACT instructions for rule specifications. Do not generate generic rules unless specifically requested.

RULES:
- type: submission always
- Use: title (includes), title (matches), body (includes), body (matches)
- Author conditions nested under author: with satisfy_any_threshold: true
- action: remove, approve, or report
- Always include comment: | and modmail: | blocks
- Rule name as comment after ---
- Wrap in \`\`\`yaml ... \`\`\`
- No prose outside code fence
- Author flair: author_flair_text at top level, NOT under author:
- Negate with ~ prefix: ~author_flair_text: "official"
- Modmail ONLY uses: {{permalink}} {{author}} {{title}} {{body}} {{kind}} {{domain}} {{url}} {{author_flair_text}} {{link_flair_text}}
- NEVER use dotted variables like {{author.account_age}} — they don't exist in AutoModerator
- If rule needs BOTH author thresholds AND title/body keyword matching, split into TWO rules

Example:
\`\`\`yaml
---
# Spam guard
type: submission
title (includes): ['spam']
author:
  satisfy_any_threshold: true
  account_age: "< 7 days"
  combined_karma: "< 100"
action: remove
comment_stickied: true
comment: |
  Removed.
modmail: |
  Removed: {{permalink}}
  User: u/{{author}}
  Title: {{title}}
---
\`\`\``;

async function testYamlGeneration() {
  console.log('Testing YAML generation with Gemini API...');
  console.log('Prompt:', TEST_PROMPT);
  console.log('');

  try {
    // Build the full prompt
    const fullPrompt = [
      AUTOMOD_SYSTEM_PROMPT,
      'Understood. I will output only valid AutoModerator YAML.',
      '',
      `User: ${TEST_PROMPT}`,
    ].join('\n\n');

    console.log('Calling Gemini API...');
    const response = await generateTextWithGemini(fullPrompt, GEMINI_API_KEY);
    
    console.log('Generated YAML:');
    console.log('---');
    console.log(response);
    console.log('---');
    console.log('');

    // Validate YAML structure
    const hasYamlDelimiters = response.includes('```yaml') && response.includes('```');
    const hasTypeSubmission = response.includes('type: submission');
    const hasAction = response.includes('action:');
    const hasComment = response.includes('comment:');
    const hasModmail = response.includes('modmail:');
    const hasAuthorBlock = response.includes('author:');
    const hasDelimiters = response.includes('---');

    console.log('Validation Results:');
    console.log('- Has YAML delimiters (```yaml):', hasYamlDelimiters);
    console.log('- Has type: submission:', hasTypeSubmission);
    console.log('- Has action:', hasAction);
    console.log('- Has comment:', hasComment);
    console.log('- Has modmail:', hasModmail);
    console.log('- Has author block:', hasAuthorBlock);
    console.log('- Has --- delimiters:', hasDelimiters);
    console.log('');

    // Check for prohibited patterns
    const hasDottedVars = response.includes('{{author.') || response.includes('{{post.');
    const hasProseOutside = !hasYamlDelimiters || (response.split('```').length > 3);
    
    console.log('Prohibited Pattern Checks:');
    console.log('- Has dotted variables ({{author. etc):', hasDottedVars);
    console.log('- Has prose outside code fence:', hasProseOutside);
    console.log('');

    const allRequired = hasYamlDelimiters && hasTypeSubmission && hasAction && hasComment && hasModmail && hasAuthorBlock && hasDelimiters;
    const noProhibited = !hasDottedVars && !hasProseOutside;

    if (allRequired && noProhibited) {
      console.log('✅ YAML generation test PASSED');
      console.log('');
      console.log('The prompt generates correct YAML with:');
      console.log('- Proper YAML structure with delimiters');
      console.log('- Required fields (type, action, comment, modmail)');
      console.log('- Author block for account conditions');
      console.log('- No dotted variables');
      console.log('- No prose outside code fence');
    } else {
      console.log('❌ YAML generation test FAILED');
      if (!allRequired) {
        console.log('Missing required fields or structure');
      }
      if (hasDottedVars) {
        console.log('Contains prohibited dotted variables');
      }
      if (hasProseOutside) {
        console.log('Contains prose outside code fence');
      }
    }
  } catch (error) {
    console.error('Error testing YAML generation:', error.message);
    process.exit(1);
  }
}

testYamlGeneration();
