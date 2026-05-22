import { useEffect, useRef, useState } from 'react';
import type { AutomodAST, ChatMessage } from '../types';
import { astToYaml } from '../utils/yaml-ast';
import { buildSubredditContextPrompt, fetchSubredditContext } from '../utils/reddit';
import { DEFAULT_AUTOMOD_RULE, parseAutomodRuleDraft } from '../../shared/automod';
import type { BlastRadiusResult } from '../../shared/blast-types';
import type { DebugResponse } from '../../shared/debug-types';
import DebugResultCard from './DebugResultCard';
import { formatDebugMessage, parsePostId } from '../utils/debug';

interface ChatModeProps {
  ast: AutomodAST;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onApplyAST: (ast: AutomodAST) => void;
  onApplyYaml: (yaml: string) => void;
  subredditName?: string | undefined;
  contextYaml?: string | undefined;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const APPLY_INTENT_RE =
  /^\s*(yeah[\,\s]*(good[\,\s]*)?)?(ok[\,\s]*|yes[\,\s]*|sure[\,\s]*|looks?\s+good[\,\s]*|perfect[\,\s]*|great[\,\s]*|awesome[\,\s]*)?(apply|use\s+(this|these|it)|add\s+(this|these|it)|implement\s+(this|it)|do\s+it|go\s+ahead|use\s+this\s+rule)\s*[.!]?\s*$/i;

function extractLastYaml(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const msg = messages[index];

    if (!msg || msg.role !== 'assistant') {
      continue;
    }

    const match = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractYamlBlock(content: string): string | null {
  const match = content.match(/```(?:yaml)?\n([\s\S]*?)```/);
  return match?.[1] ? match[1].trim() : null;
}

function detectDebugIntent(text: string): string | null {
  const postId = parsePostId(text);
  const intentRe = /why.*(removed|flagged|filtered)|what.*(rule|automod).*(got|hit|caught|removed)|debug.*post/i;

  return intentRe.test(text) && postId ? postId : null;
}

function formatBlastMessage(result: BlastRadiusResult): string {
  if (result.totalTested === 0) {
    return '⚡ **Blast Radius**: No cached posts yet. This rule will be backtested once the subreddit has history.';
  }

  const falsePositiveLines = result.falsePositives
    .slice(0, 3)
    .map((post) => `- "${post.title}" (u/${post.author})`)
    .join('\n');

  return [
    `⚡ **Blast Radius** (tested against last ${result.totalTested} posts)`,
    `✅ Would have caught **${result.wouldCatch} spam posts**`,
    result.falsePositives.length > 0
      ? `⚠️ Would have **falsely flagged ${result.falsePositives.length} legitimate posts**:\n${falsePositiveLines}`
      : '✅ No false positives detected',
    `Catch rate: ${(result.catchRate * 100).toFixed(0)}% | False positive rate: ${(result.falsePositiveRate * 100).toFixed(0)}%`,
  ].join('\n\n');
}

function MessageBubble({
  msg,
  onApply,
  applied,
}: {
  msg: ChatMessage;
  onApply: ((yaml: string) => void) | undefined;
  applied: boolean;
}) {
  const [justApplied, setJustApplied] = useState(false);
  const debugResult = msg.debugResult;
  const yamlMatch = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
  const yamlValue = yamlMatch?.[1] ?? '';
  const textParts = msg.content.split(/```(?:yaml)?\n[\s\S]*?```/);

  const handleApply = (yaml: string) => {
    if (!onApply) {
      return;
    }

    onApply(yaml);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 3000);
  };

  const showApplied = justApplied || applied;

  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          msg.role === 'user'
            ? 'bg-gradient-to-br from-purple-400 to-pink-400 text-white'
            : 'bg-white border border-[#EFEFEF] text-[#1A1020] shadow-sm'
        }`}
      >
        {msg.role === 'user' ? '👤' : '✳'}
      </div>
      <div
        className={`max-w-[82%] rounded-[20px] p-3.5 text-sm ${
          msg.role === 'user'
            ? 'bg-[#1A1020] text-white rounded-br-sm'
            : 'bg-white border border-[#EFEFEF] text-[#1A1020] rounded-bl-sm shadow-sm'
        }`}
      >
        {debugResult ? (
          <DebugResultCard result={debugResult} onApplyYaml={handleApply} />
        ) : (
          textParts.map((part, index) => (
            <span key={index}>
              {part && <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1F2937]">{part}</p>}
              {index === 0 && yamlMatch && (
                <div className="mt-2 overflow-hidden rounded-xl border border-[#E7EAF1] bg-white">
                  <div className="flex items-center justify-between bg-[#FBFCFF] px-3 py-1.5">
                    <span className="font-mono text-[10px] text-[#8B93A5]">yaml</span>
                    {onApply !== undefined && (
                      <button
                        onClick={() => handleApply(yamlValue)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-200 ${
                          showApplied ? 'text-[#22A06B]' : 'text-[#FF6B35] hover:text-[#F35B20]'
                        }`}
                      >
                        {showApplied ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="#22A06B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Applied to Code
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <path d="M2 5.5H9M6 2.5L9 5.5L6 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Apply to Rules
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap wrap-break-word bg-[#FBFCFF] p-3 font-mono text-xs leading-6 text-[#0F766E]">
                    {yamlValue}
                  </pre>
                </div>
              )}
            </span>
          ))
        )}
        <div className="mt-1.5 text-[10px] text-[#8B93A5]">{new Date(msg.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

export default function ChatMode({
  ast,
  messages,
  onAddMessage,
  onApplyAST: _onApplyAST,
  onApplyYaml,
  subredditName,
  contextYaml,
}: ChatModeProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const [subredditContext, setSubredditContext] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    let isActive = true;

    const loadSubredditContext = async () => {
      if (!subredditName) {
        setSubredditContext('');
        return;
      }

      try {
        const ctx = await fetchSubredditContext(subredditName);
        if (isActive) {
          setSubredditContext(buildSubredditContextPrompt(ctx));
        }
      } catch {
        if (isActive) {
          setSubredditContext('');
        }
      }
    };

    void loadSubredditContext();

    return () => {
      isActive = false;
    };
  }, [subredditName]);

  const handleApplyYaml = (yamlStr: string, msgId: string) => {
    onApplyYaml(yamlStr);
    setAppliedMsgId(msgId);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const trimmed = text.trim();
    const debugPostId = detectDebugIntent(trimmed);

    if (APPLY_INTENT_RE.test(trimmed)) {
      const lastYaml = extractLastYaml(messages);

      if (lastYaml) {
        const userMsg: ChatMessage = {
          id: genId(),
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
        };
        const lastAiMsg = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.includes('```'));
        const confirmMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: 'Done! The rules have been applied to your Code editor. Switch to **Code** or **Drag** mode to see them.',
          timestamp: Date.now(),
        };
        onAddMessage(userMsg);
        onApplyYaml(lastYaml);
        if (lastAiMsg) {
          setAppliedMsgId(lastAiMsg.id);
        }
        onAddMessage(confirmMsg);
        setInput('');
        return;
      }
    }

    setError(null);
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    onAddMessage(userMsg);
    setInput('');
    setIsLoading(true);

    try {
      if (debugPostId) {
        const response = await fetch('/api/rule-stage/debug', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ postId: debugPostId }),
        });

        if (!response.ok) {
          throw new Error('Failed to debug post');
        }

        const data = (await response.json()) as { status: 'success'; debug: DebugResponse };

        onAddMessage({
          id: genId(),
          role: 'assistant',
          content: formatDebugMessage(data.debug),
          timestamp: Date.now(),
          debugResult: data.debug,
        });

        return;
      }

      const history = messages.map((message) => ({
        role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        content: message.content,
      }));

      let contextual = trimmed;
      const currentYaml = contextYaml ?? (ast.length > 0 ? astToYaml(ast) : '');
      if (currentYaml) {
        contextual = `Current rules:\n\`\`\`yaml\n${currentYaml}\n\`\`\`\n\nRequest: ${trimmed}`;
      }

      const chatResponse = await fetch('/api/rule-stage/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: contextual,
          history,
          subredditContext,
        }),
      });

      if (!chatResponse.ok) {
        const payload = (await chatResponse.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Failed to fetch chat response');
      }

      const chatData = (await chatResponse.json()) as { status: 'success'; response: string };
      const response = chatData.response;

      onAddMessage({
        id: genId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });

      const yamlInReply = extractYamlBlock(response);
      if (yamlInReply) {
        try {
          const parsedRule = parseAutomodRuleDraft(yamlInReply, DEFAULT_AUTOMOD_RULE);
          const blastResponse = await fetch('/api/rule-stage/blast', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rule: parsedRule }),
          });

          if (blastResponse.ok) {
            const blastData = (await blastResponse.json()) as { status: 'success'; blast: BlastRadiusResult };
            if (blastData.status === 'success') {
              onAddMessage({
                id: genId(),
                role: 'assistant',
                content: formatBlastMessage(blastData.blast),
                timestamp: Date.now(),
              });
            }
          }
        } catch (blastError) {
          console.warn('Blast Radius backtest failed:', blastError);
        }
      }
    } catch (caughtError) {
      setError((caughtError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-[#E7E9F0] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex-1 overflow-auto bg-white px-5 py-5">
        {messages.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-[#AAAAAA]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F5C842] text-[#1A1020] shadow-sm text-2xl">
              ✳
            </div>
            <p className="text-base font-semibold text-[#1A1020]">How can I help you today?</p>
            <p className="max-w-xs text-sm text-[#AAAAAA]">Ask me anything — I'm powered by ChaTin AI</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              applied={appliedMsgId === msg.id}
              onApply={msg.role === 'assistant' ? (yaml) => handleApplyYaml(yaml, msg.id) : undefined}
            />
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-[#EFEFEF] text-[#1A1020] text-sm font-bold shadow-sm">✳</div>
              <div className="rounded-[20px] rounded-bl-sm border border-[#EFEFEF] bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-[#1A1020]"
                      style={{
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-[#FECACA] bg-[#FFF1F2] p-3 text-xs text-[#B42318] shadow-sm">
              Error: {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[#F0F0F0] bg-white px-5 py-4">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder='Write a message... or type "apply" to use the last rule'
            rows={2}
            data-testid="chat-input"
            className="min-h-13.5 flex-1 resize-none rounded-[16px] border border-[#EBEBEB] bg-[#F4F2F7] px-4 py-3 text-sm text-[#1A1020] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#F5C842] disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            data-testid="btn-send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#F5C842] text-[#1A1020] shadow-[0_8px_20px_rgba(245,200,66,0.35)] transition-colors hover:bg-[#e6b93c] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 7.5L13 2L8.5 13L7 8.5L2 7.5Z" fill="white" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#8B93A5]">Shift+Enter for new line · Enter to send · type "apply" to use last rule</p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}