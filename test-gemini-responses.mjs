/**
 * AutoMod Builder — GitHub Model Response Tester
 *
 * Tests all prompt modes against a GitHub-hosted model and validates expected responses.
 * Uses GitHub model `gpt-4o` by default for all runs unless overridden by GITHUB_MODEL_ID.
 *
 * Usage:
 *   GITHUB_API_KEY=your_key GITHUB_MODEL_ENDPOINT=https://your-llm-endpoint node test-gemini-responses.mjs
 *   GITHUB_API_KEY=your_key GITHUB_MODEL_ENDPOINT=https://your-llm-endpoint node test-gemini-responses.mjs --list-models
 *   GITHUB_API_KEY=your_key GITHUB_MODEL_ENDPOINT=https://your-llm-endpoint node test-gemini-responses.mjs --only chat
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;

  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile();

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Use GitHub model by default in dev; override with GITHUB_MODEL_ID.
const API_KEY = process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || '';

const MODEL = process.env.GITHUB_MODEL_ID || 'gpt-4o';
const GITHUB_MODEL_ENDPOINT = process.env.GITHUB_MODEL_ENDPOINT || '';

// No Gemini fallback: prefer GitHub. If no explicit endpoint is set, use a sensible GitHub default.
const USE_GEMINI_FALLBACK = false;
const EFFECTIVE_GITHUB_ENDPOINT = GITHUB_MODEL_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const LIST_MODELS_ONLY = args.includes('--list-models');

// Conservative request pacing while testing against the model endpoint.
const RATE_LIMITS = { rpm: 5, rpd: 20, tpm: 250000 };

// Delay between requests in ms  (add buffer on top of theoretical minimum)
const MS_BETWEEN_REQUESTS = Math.ceil((60 / RATE_LIMITS.rpm) * 1000) + 2000;

// Optional filter: --only chat | decoder | escape-hatch | debug
const onlyFilter = args.find((_, i) => args[i - 1] === '--only');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function log(msg) { process.stdout.write(msg + '\n'); }
function pass(label) { log(`  ${GREEN}✓${RESET} ${label}`); }
function fail(label, reason) { log(`  ${RED}✗${RESET} ${label}\n    ${DIM}${reason}${RESET}`); }
function warn(label) { log(`  ${YELLOW}⚠${RESET} ${label}`); }
function section(title) { log(`\n${BOLD}${CYAN}▸ ${title}${RESET}`); }

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchWithRetry(url, init, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);

    if (res.ok) {
      return res;
    }

    if (res.status !== 429 && res.status !== 503) {
      return res;
    }

    const body = await res.text();
    lastError = new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);

    if (attempt < maxAttempts) {
      await sleep(1000 * attempt * attempt);
      continue;
    }
  }

  throw lastError ?? new Error('Model API request failed');
}

async function callModel({ prompt, systemPrompt, history = [], jsonMode = false, maxTokens = 1024, responseSchema = null }) {
  // GitHub-only model call. This script no longer supports Gemini fallback.
  if (!EFFECTIVE_GITHUB_ENDPOINT) {
    throw new Error('GITHUB_MODEL_ENDPOINT must be set to a valid GitHub model endpoint. Gemini fallback has been disabled.');
  }

  if (!API_KEY) {
    throw new Error('GITHUB_API_KEY or GITHUB_TOKEN must be set.');
  }

  const url = EFFECTIVE_GITHUB_ENDPOINT;

  // Build a combined prompt similar to previous Gemini style so existing prompts work unchanged.
  const parts = [];
  if (systemPrompt) {
    parts.push(systemPrompt);
    parts.push('Understood. I will follow these instructions.');
  }

  for (const msg of history) {
    parts.push(`${msg.role === 'model' ? 'Assistant:' : 'User:'} ${msg.content}`);
  }

  parts.push(`User: ${prompt}`);

  const combined = parts.join('\n\n');

  const payload = {
    model: MODEL.includes('/') ? MODEL : `openai/${MODEL}`,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...history.map((msg) => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content,
      })),
      { role: 'user', content: prompt },
    ],
    temperature: jsonMode ? 0 : 0.2,
    max_tokens: maxTokens,
  };

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${API_KEY}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => null);

  // Try multiple common response shapes to extract text.
  let text = null;

  if (data && typeof data.output_text === 'string') {
    text = data.output_text;
  } else if (data && data.result && typeof data.result.output_text === 'string') {
    text = data.result.output_text;
  } else if (Array.isArray(data?.choices) && (data.choices[0].text ?? data.choices[0].message?.content)) {
    text = data.choices[0].text ?? data.choices[0].message?.content;
  } else if (typeof data?.output === 'string') {
    text = data.output;
  } else if (Array.isArray(data?.output)) {
    text = data.output.map((o) => (o?.content ?? o?.text ?? '')).join('\n');
  } else {
    text = JSON.stringify(data || {});
  }

  return typeof text === 'string' ? text : JSON.stringify(text);
}

async function listGeminiModels() {
  return [{ name: MODEL.includes('/') ? MODEL : `openai/${MODEL}`, displayName: MODEL, description: 'Configured GitHub model', methods: [] }];
}

const DECODER_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tricks: {
      type: 'ARRAY',
      items: {
        type: 'STRING',
        enum: ['homoglyph', 'zero-width', 'look-alike', 'separator-noise', 'evasive-phrasing', 'mixed-script'],
      },
    },
    explanation: { type: 'STRING' },
    regexPattern: { type: 'STRING' },
    automodYaml: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
  },
  required: ['tricks', 'explanation', 'regexPattern', 'automodYaml', 'confidence'],
};

const ESCAPE_HATCH_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hasLimitation: { type: 'BOOLEAN' },
    limitation: {
      type: 'STRING',
      nullable: true,
      enum: [
        'external-api',
        'json-parsing',
        'database-check',
        'complex-math',
        'conditional-logic',
        'state-management',
        'batch-processing',
        'other',
      ],
    },
    explanation: { type: 'STRING' },
    recommendation: { type: 'STRING', enum: ['yaml', 'typescript'] },
  },
  required: ['hasLimitation', 'limitation', 'explanation', 'recommendation'],
};

const DEBUG_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    explanation: { type: 'STRING' },
    fixedYaml: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
  },
  required: ['explanation', 'fixedYaml', 'confidence'],
};

function stripCodeFences(text) {
  const m = text.trim().match(/^```(?:json|yaml)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : text.trim();
}

function tryParseJson(text) {
  const normalized = stripCodeFences(text);

  try {
    return JSON.parse(normalized);
  } catch {
    // Fallback: extract the outermost JSON object if the model adds extra text.
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    const candidate = normalized.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

// ─── PROMPTS (mirrored from production source) ────────────────────────────────

const AUTOMOD_SYSTEM_PROMPT = `You are an AutoModerator rule assistant for Reddit. Your ONLY job is to output a single, complete AutoModerator YAML rule block in response to the user's request.

STRICT RULES:
1. Always output exactly ONE rule wrapped in --- delimiters.
2. Never include or repeat previous rules - write a fresh standalone rule each time.
3. type must always be: submission
4. For text matching use ONLY these exact keys on a single line, never as nested objects:
  title (includes): ['phrase1', 'phrase2']
  title (matches): ['regex']
  body (includes): ['phrase']
  body (matches): ['regex']
  Wrong: title:
    includes: ['phrase1']
  Never invent other keys like "title (includes-word)" or "report_reason".
5. Numeric author conditions go nested under author: block:
   author:
     satisfy_any_threshold: true
     account_age: "< 30 days"
     combined_karma: "< 50"
6. action must be one of: remove, approve, report
7. Always include comment: | and modmail: | as block literals.
8. The rule name is a comment on the line after the first ---:
   ---
   # Rule name here
   type: submission
   ...
   ---
9. Do not add any prose, explanation, or markdown outside the yaml code fence.
10. Wrap the YAML in a code fence: \`\`\`yaml ... \`\`\``;

function buildDecoderPrompt(examples) {
  return [
    'You are analyzing spam messages that bypass moderation by using Unicode and phrasing obfuscation.',
    'Inspect all three examples and identify the shared tricks used across the campaign.',
    'Return a single JSON object only. Do not wrap it in markdown fences or add commentary.',
    'Keep the explanation very concise and the regexPattern compact so the full object fits in one response.',
    'Prefer the shortest valid regex that still matches the shared campaign. Do not over-explain.',
    'Keep tricks to the 1-3 most relevant items.',
    'Make automodYaml a one-line stub only; do not include a full YAML block.',
    'Avoid backslash-heavy regexes; do not use \\w, \\b, or other escape sequences unless absolutely necessary.',
    'Prefer literal alternation and simple character classes so the JSON stays parseable.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "tricks": ["homoglyph" | "zero-width" | "look-alike" | "separator-noise" | "evasive-phrasing" | "mixed-script"],',
    '  "explanation": "human readable breakdown of each trick and how it works",',
    '  "regexPattern": "a single regex string that would match the campaign",',
    '  "automodYaml": "AutoModerator YAML snippet that applies the regex pattern",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Example 1:', examples[0],
    '', 'Example 2:', examples[1],
    '', 'Example 3:', examples[2],
  ].join('\n');
}

function buildEscapeHatchAnalysisPrompt(request) {
  return [
    'You are helping a moderator determine whether AutoModerator YAML can handle a request.',
    'First decide whether the request can be expressed natively in YAML.',
    'If YAML can handle it, return a JSON object that says so.',
    'If YAML cannot handle it, explain the limitation and recommend TypeScript.',
    '',
    'AutoModerator YAML can handle text matching, thresholds, account age, karma checks, and simple rule actions.',
    'AutoModerator YAML cannot handle external API calls, JSON parsing, database checks, complex math, stateful logic, or batch processing.',
    'Do NOT treat account_age, combined_karma, or title/body matching as limitations; those are native YAML features.',
    'If the request only combines title/body matching with account_age or combined_karma thresholds, set hasLimitation to false and recommendation to yaml.',
    '',
    'Return a single JSON object only with this shape:',
    '{',
    '  "hasLimitation": boolean,',
    '  "limitation": "external-api" | "json-parsing" | "database-check" | "complex-math" | "conditional-logic" | "state-management" | "batch-processing" | "other" | null,',
    '  "explanation": "short explanation of the result",',
    '  "recommendation": "yaml" | "typescript"',
    '}',
    '',
    'Moderator request:',
    request,
    '',
    'Be strict. If the request requires any capability outside native AutoModerator YAML, mark hasLimitation as true and recommend TypeScript.',
  ].join('\n');
}

function buildDebugPrompt(post, matchedRules) {
  const matchSummary = matchedRules.map((match, i) => [
    `Match ${i + 1}:`,
    `Rule name: ${match.ruleName}`,
    `Confidence: ${match.confidence}`,
    `Line range: ${match.lineStart}-${match.lineEnd}`,
    `Matched condition: ${match.matchedCondition.field} ${match.matchedCondition.comparator} ${match.matchedCondition.value}`,
    'Rule YAML:', match.rawYaml,
  ].join('\n')).join('\n\n');

  return [
    'You are explaining why AutoModerator matched a Reddit post and how to tighten the rule with a minimal rewrite.',
    'Return a single JSON object only. Do not include markdown fences or commentary.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "explanation": "short human readable explanation of why the rule fired",',
    '  "fixedYaml": "a minimal YAML rewrite that preserves the intent while reducing false positives",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Post title:', post.title,
    '', 'Post body:', post.body,
    '', 'Post author:', post.author,
    '', 'Matched rules:', matchSummary || 'No matched rules were detected.',
    '', 'Keep the rewrite focused on the matched blocks only. Do not invent unrelated rule changes.',
  ].join('\n');
}

// ─── TEST SUITE DEFINITIONS ───────────────────────────────────────────────────

/**
 * Each test case:
 *   id        - unique slug
 *   group     - category (chat | decoder | escape-hatch | debug)
 *   prompt    - what we send
 *   call      - async fn that calls the configured model endpoint and returns raw text
 *   validate  - fn(rawText) => array of { ok, label, detail? }
 */

const TEST_CASES = [
  // ──────────── CHAT MODE ────────────────────────────────────────────────────
  {
    id: 'chat-basic-spam',
    group: 'chat',
    prompt: 'Block posts with "buy now" or "grab yours" from new accounts under 30 days old',
    async call() {
      return callModel({
        systemPrompt: AUTOMOD_SYSTEM_PROMPT,
        prompt: this.prompt,
        maxTokens: 1024,
      });
    },
    validate(raw) {
      const yaml = stripCodeFences(raw);
      return [
        { ok: raw.includes('```yaml'), label: 'Wrapped in ```yaml code fence' },
        { ok: yaml.includes('type: submission'), label: 'type: submission present' },
        { ok: yaml.includes('---'), label: 'Wrapped in --- delimiters' },
        { ok: /title \(includes\)/.test(yaml), label: 'Uses title (includes) key' },
        { ok: /action:\s*(remove|report)/.test(yaml), label: 'action is remove or report' },
        { ok: yaml.includes('account_age'), label: 'account_age condition present' },
        { ok: yaml.includes('comment:'), label: 'comment: block present' },
        { ok: yaml.includes('modmail:'), label: 'modmail: block present' },
        { ok: !/title \(includes-word\)/.test(yaml), label: 'Does NOT use invented key title (includes-word)' },
      ];
    },
  },
  {
    id: 'chat-karma-threshold',
    group: 'chat',
    prompt: 'Remove posts from users with combined karma below 50 and account age under 7 days',
    async call() {
      return callModel({
        systemPrompt: AUTOMOD_SYSTEM_PROMPT,
        prompt: this.prompt,
        maxTokens: 1024,
      });
    },
    validate(raw) {
      const yaml = stripCodeFences(raw);
      return [
        { ok: yaml.includes('combined_karma'), label: 'combined_karma condition present' },
        { ok: yaml.includes('account_age'), label: 'account_age condition present' },
        { ok: yaml.includes('author:'), label: 'Numeric conditions nested under author:' },
        { ok: /action:\s*remove/.test(yaml), label: 'action: remove' },
        { ok: yaml.includes('satisfy_any_threshold'), label: 'satisfy_any_threshold key present' },
      ];
    },
  },
  {
    id: 'chat-regex-title',
    group: 'chat',
    prompt: 'Flag posts whose title matches "\\b(crypto|nft|web3)\\b" using regex',
    async call() {
      return callModel({
        systemPrompt: AUTOMOD_SYSTEM_PROMPT,
        prompt: this.prompt,
        maxTokens: 1024,
      });
    },
    validate(raw) {
      const yaml = stripCodeFences(raw);
      return [
        { ok: /title \(matches\)/.test(yaml), label: 'Uses title (matches) for regex' },
        { ok: /crypto|nft|web3/.test(yaml), label: 'Regex contains the requested keywords' },
        { ok: yaml.includes('type: submission'), label: 'type: submission present' },
      ];
    },
  },

  // ──────────── DECODER MODE ─────────────────────────────────────────────────
  {
    id: 'decoder-homoglyph',
    group: 'decoder',
    prompt: 'analyze obfuscation',
    examples: [
      'Vist our websіte: vіagra-shop.com — best prіces!',
      'Сlick here for vіаgrа deals: meds-shop.net',
      'Buy vіаgrа online at lоwest priсe — vіаgra-deals.org',
    ],
    async call() {
      return callModel({
        prompt: buildDecoderPrompt(this.examples),
        jsonMode: true,
        maxTokens: 8192,
        responseSchema: DECODER_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: Array.isArray(parsed?.tricks), label: 'tricks is an array' },
        {
          ok: parsed?.tricks?.some((t) => ['homoglyph', 'look-alike', 'mixed-script'].includes(t)),
          label: 'Detects homoglyph or look-alike trick',
        },
        { ok: typeof parsed?.explanation === 'string' && parsed.explanation.length > 10, label: 'explanation is a non-empty string' },
        { ok: typeof parsed?.regexPattern === 'string', label: 'regexPattern field present' },
        { ok: typeof parsed?.automodYaml === 'string', label: 'automodYaml field present' },
        { ok: ['high', 'medium', 'low'].includes(parsed?.confidence), label: 'confidence is high/medium/low' },
      ];
    },
  },
  {
    id: 'decoder-zero-width',
    group: 'decoder',
    prompt: 'analyze zero-width obfuscation',
    examples: [
      'F\u200Bree m\u200Boney — cl\u200Bick now!',
      'Fr\u200Bee ca\u200Bsh ev\u200Bery day',
      'F\u200Br\u200Be\u200Be m\u200Bo\u200Bn\u200Be\u200By guaranteed',
    ],
    async call() {
      return callModel({
        prompt: buildDecoderPrompt(this.examples),
        jsonMode: true,
        maxTokens: 8192,
        responseSchema: DECODER_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        {
          ok: parsed?.tricks?.some((t) => ['zero-width', 'separator-noise'].includes(t)),
          label: 'Detects zero-width trick',
        },
        { ok: typeof parsed?.regexPattern === 'string' && parsed.regexPattern.length > 0, label: 'Non-empty regex pattern returned' },
        { ok: ['high', 'medium', 'low'].includes(parsed?.confidence), label: 'Valid confidence value' },
      ];
    },
  },

  // ──────────── ESCAPE HATCH MODE ────────────────────────────────────────────
  {
    id: 'escape-yaml-capable',
    group: 'escape-hatch',
    prompt: 'Remove posts from accounts younger than 30 days that contain "buy now" in the title',
    async call() {
      return callModel({
        prompt: buildEscapeHatchAnalysisPrompt(this.prompt),
        jsonMode: true,
        maxTokens: 1024,
        responseSchema: ESCAPE_HATCH_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: typeof parsed?.hasLimitation === 'boolean', label: 'hasLimitation is boolean' },
        { ok: parsed?.hasLimitation === false, label: 'hasLimitation is false (YAML can handle this)' },
        { ok: parsed?.recommendation === 'yaml', label: 'recommendation is yaml' },
        { ok: typeof parsed?.explanation === 'string', label: 'explanation field present' },
      ];
    },
  },
  {
    id: 'escape-typescript-needed',
    group: 'escape-hatch',
    prompt: 'Check if a user has made any posts in the last 24 hours by querying an external API before allowing submission',
    async call() {
      return callModel({
        prompt: buildEscapeHatchAnalysisPrompt(this.prompt),
        jsonMode: true,
        maxTokens: 1024,
        responseSchema: ESCAPE_HATCH_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      const validLimitations = [
        'external-api', 'json-parsing', 'database-check', 'complex-math',
        'conditional-logic', 'state-management', 'batch-processing', 'other',
      ];
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: parsed?.hasLimitation === true, label: 'hasLimitation is true (YAML cannot handle external API)' },
        { ok: parsed?.recommendation === 'typescript', label: 'recommendation is typescript' },
        { ok: validLimitations.includes(parsed?.limitation), label: `limitation is a valid enum value (got: ${parsed?.limitation})` },
      ];
    },
  },
  {
    id: 'escape-state-management',
    group: 'escape-hatch',
    prompt: 'Track how many posts a user has made this week and block them after 5 posts',
    async call() {
      return callModel({
        prompt: buildEscapeHatchAnalysisPrompt(this.prompt),
        jsonMode: true,
        maxTokens: 1024,
        responseSchema: ESCAPE_HATCH_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: parsed?.hasLimitation === true, label: 'hasLimitation is true (stateful)' },
        { ok: parsed?.recommendation === 'typescript', label: 'recommendation is typescript' },
      ];
    },
  },

  // ──────────── DEBUG MODE ───────────────────────────────────────────────────
  {
    id: 'debug-basic-match',
    group: 'debug',
    prompt: 'explain rule match',
    post: {
      id: 'abc123',
      title: 'Buy Bitcoin NOW — limited offer!',
      body: 'Click the link to get started',
      author: 'spammer_99',
      accountAgeDays: 2,
      combinedKarma: 10,
    },
    matchedRules: [
      {
        ruleName: 'Crypto spam guard',
        confidence: 'high',
        lineStart: 1,
        lineEnd: 10,
        matchedCondition: { field: 'title', comparator: 'includes', value: 'bitcoin' },
        rawYaml: `---\n# Crypto spam guard\ntype: submission\ntitle (includes): ['bitcoin','crypto']\naction: remove\ncomment: |\n  Removed.\nmodmail: |\n  Spam: {{permalink}}\n---`,
      },
    ],
    async call() {
      return callModel({
        prompt: buildDebugPrompt(this.post, this.matchedRules),
        jsonMode: true,
        maxTokens: 2048,
        responseSchema: DEBUG_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: typeof parsed?.explanation === 'string' && parsed.explanation.length > 10, label: 'explanation is a non-empty string' },
        { ok: typeof parsed?.fixedYaml === 'string' && parsed.fixedYaml.length > 10, label: 'fixedYaml is present and non-trivial' },
        { ok: ['high', 'medium', 'low'].includes(parsed?.confidence), label: 'confidence is valid enum value' },
        { ok: /bitcoin|crypto|title/i.test(parsed?.explanation), label: 'Explanation references the matched field/value' },
      ];
    },
  },
  {
    id: 'debug-no-match',
    group: 'debug',
    prompt: 'explain rule match with no results',
    post: {
      id: 'xyz999',
      title: 'Hello world',
      body: 'Normal post body',
      author: 'legit_user',
      accountAgeDays: 500,
      combinedKarma: 10000,
    },
    matchedRules: [],
    async call() {
      return callModel({
        prompt: buildDebugPrompt(this.post, this.matchedRules),
        jsonMode: true,
        maxTokens: 1024,
        responseSchema: DEBUG_JSON_SCHEMA,
      });
    },
    validate(raw) {
      const parsed = tryParseJson(raw);
      return [
        { ok: parsed !== null, label: 'Response is valid JSON' },
        { ok: typeof parsed?.explanation === 'string', label: 'explanation field present' },
        { ok: typeof parsed?.fixedYaml === 'string', label: 'fixedYaml field present (even if empty)' },
        { ok: ['high', 'medium', 'low'].includes(parsed?.confidence), label: 'Valid confidence value' },
      ];
    },
  },
];

// ─── RUNNER ───────────────────────────────────────────────────────────────────

async function runTests() {
  if (!API_KEY) {
    log(`${RED}Error: GITHUB_API_KEY (or GITHUB_TOKEN) is not set.${RESET}`);
    log(`${DIM}Usage: GITHUB_API_KEY=your_key GITHUB_MODEL_ENDPOINT=https://your-endpoint node test-gemini-responses.mjs${RESET}`);
    process.exit(1);
  }

  const availableModels = await listGeminiModels();

  log(`\n${BOLD}Available models${RESET}`);
  if (availableModels.length === 0) {
    log(`${DIM}No models returned by the API.${RESET}`);
  } else {
    for (const model of availableModels) {
      const methodList = model.methods.length ? model.methods.join(', ') : 'unknown methods';
      const displayName = model.displayName ? ` (${model.displayName})` : '';
      log(`  ${model.name}${displayName} - ${methodList}`);
      if (model.description) {
        log(`    ${DIM}${model.description}${RESET}`);
      }
    }
  }

  // Clarify which provider will be used for requests (GitHub only).
  log(`\n${DIM}Using provider: GitHub (endpoint: ${EFFECTIVE_GITHUB_ENDPOINT})${RESET}`);

  if (LIST_MODELS_ONLY) {
    return;
  }

  const filteredTests = onlyFilter
    ? TEST_CASES.filter((t) => t.group === onlyFilter)
    : TEST_CASES;

  if (filteredTests.length === 0) {
    log(`${RED}No test cases found for group: ${onlyFilter}${RESET}`);
    process.exit(1);
  }

  log(`\n${BOLD}AutoMod Builder — GitHub Model Response Tester${RESET}`);
  log(`${DIM}Model: ${MODEL}${RESET}`);
  log(`${DIM}Rate limits: ${RATE_LIMITS.rpm} RPM, ${RATE_LIMITS.rpd} RPD${RESET}`);
  log(`${DIM}Delay between requests: ${(MS_BETWEEN_REQUESTS / 1000).toFixed(1)}s${RESET}`);
  log(`${DIM}Total test cases: ${filteredTests.length}${RESET}`);

  if (filteredTests.length > RATE_LIMITS.rpd) {
    warn(`${filteredTests.length} tests exceed daily limit (${RATE_LIMITS.rpd} RPD). Some may fail.`);
  }

  const results = [];
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let currentGroup = null;

  for (let i = 0; i < filteredTests.length; i++) {
    const tc = filteredTests[i];

    if (tc.group !== currentGroup) {
      currentGroup = tc.group;
      section(`${currentGroup.toUpperCase()} MODE`);
    }

    log(`\n  ${DIM}[${i + 1}/${filteredTests.length}]${RESET} ${BOLD}${tc.id}${RESET}`);
    log(`  ${DIM}Prompt: "${tc.prompt.slice(0, 80)}${tc.prompt.length > 80 ? '…' : ''}"${RESET}`);

    // Rate-limit delay (skip before first request)
    if (i > 0) {
      log(`  ${DIM}⏳ Waiting ${(MS_BETWEEN_REQUESTS / 1000).toFixed(1)}s (rate limit)…${RESET}`);
      await sleep(MS_BETWEEN_REQUESTS);
    }

    let raw = '';
    let callError = null;
    const startMs = Date.now();

    try {
      raw = await tc.call();
    } catch (err) {
      callError = err.message;
    }

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
    log(`  ${DIM}⏱ ${elapsed}s${RESET}`);

    if (callError) {
      fail(`API call failed: ${callError}`);
      results.push({ id: tc.id, group: tc.group, status: 'error', error: callError, checks: [] });
      failCount++;
      continue;
    }

    // Run validations
    let checks;
    try {
      checks = tc.validate(raw);
    } catch (err) {
      fail(`Validator threw: ${err.message}`);
      results.push({ id: tc.id, group: tc.group, status: 'error', error: err.message, checks: [] });
      failCount++;
      continue;
    }

    let allPassed = true;
    for (const check of checks) {
      if (check.ok) {
        pass(check.label);
      } else {
        fail(check.label, check.detail || '');
        allPassed = false;
      }
    }

    results.push({
      id: tc.id,
      group: tc.group,
      status: allPassed ? 'pass' : 'fail',
      checks,
      rawResponse: raw.slice(0, 500),
    });

    if (allPassed) passCount++;
    else failCount++;
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────────

  log(`\n${'─'.repeat(60)}`);
  log(`${BOLD}Results${RESET}`);
  log(`${'─'.repeat(60)}`);
  log(`  ${GREEN}Passed:${RESET}  ${passCount}`);
  log(`  ${RED}Failed:${RESET}  ${failCount}`);
  if (skipCount) log(`  ${YELLOW}Skipped:${RESET} ${skipCount}`);
  log(`  Total:   ${filteredTests.length}`);

  // Group summary
  const groups = [...new Set(results.map((r) => r.group))];
  log('');
  for (const g of groups) {
    const groupResults = results.filter((r) => r.group === g);
    const gPass = groupResults.filter((r) => r.status === 'pass').length;
    const gFail = groupResults.filter((r) => r.status !== 'pass').length;
    const icon = gFail === 0 ? GREEN + '✓' : RED + '✗';
    log(`  ${icon}${RESET} ${g.padEnd(16)} ${gPass}/${groupResults.length} passed`);
  }

  // Write results to file
  const outPath = './test-results.json';
  writeFileSync(outPath, JSON.stringify({ model: MODEL, timestamp: new Date().toISOString(), results }, null, 2));
  log(`\n${DIM}Full results saved to ${outPath}${RESET}`);

  if (failCount > 0) {
    log(`\n${RED}${BOLD}${failCount} test(s) failed.${RESET}`);
    process.exit(1);
  } else {
    log(`\n${GREEN}${BOLD}All tests passed!${RESET}`);
  }
}

runTests().catch((err) => {
  log(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
