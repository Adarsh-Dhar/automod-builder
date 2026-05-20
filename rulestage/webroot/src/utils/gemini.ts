import type { AutomodAST } from "../types";
import { yamlToAST } from "./yaml-ast";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SYSTEM_PROMPT = `You are an AutoModerator configuration assistant for Reddit subreddits. 
Your job is to help moderators create AutoModerator rules.

When the user describes a moderation need, respond with:
1. A brief explanation (2-3 sentences)
2. A YAML code block with valid AutoModerator configuration

AutoModerator YAML format example:
\`\`\`yaml
# Block low-karma users
combined_karma: < 10
action: remove
\`\`\`

Multiple rules are separated by ---:
\`\`\`yaml
# Block spam domains
domain: bit.ly
action: remove
---
# Block new accounts posting crypto
account_age: < 30
title: (crypto|bitcoin|nft|web3)
action: remove
\`\`\`

Valid conditions:
- combined_karma, comment_karma, link_karma: < 10 (numeric comparison)
- account_age: < 30 (days)
- title: (regex pattern) 
- body: (regex pattern)
- domain: example.com
- url: (regex pattern)
- author_flair_text: "text"
- is_top_level: true/false

Valid actions:
- action: remove
- action: approve
- action: spam
- report_reason: "reason"
- lock: true

Always produce valid YAML that matches Reddit's AutoModerator format exactly.
If the user asks something unrelated to moderation, politely redirect them.`;

export async function callGemini(
  apiKey: string,
  userMessage: string,
  history: Array<{ role: "user" | "model"; content: string }>
): Promise<string> {
  const contents = [
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: { message?: string } }).error?.message ||
        `Gemini API error: ${response.status}`
    );
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export function extractYamlFromResponse(response: string): string | null {
  const match = response.match(/```yaml\n([\s\S]*?)```/);
  if (match) return match[1].trim();

  const match2 = response.match(/```\n([\s\S]*?)```/);
  if (match2) return match2[1].trim();

  return null;
}

export function extractASTFromResponse(response: string): AutomodAST | null {
  const yamlStr = extractYamlFromResponse(response);
  if (!yamlStr) return null;
  const ast = yamlToAST(yamlStr);
  return ast.length > 0 ? ast : null;
}
