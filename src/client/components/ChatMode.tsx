import { useEffect, useRef, useState } from 'react';
import type { AutomodAST, ChatMessage } from '../types';
import { astToYaml } from '../utils/yaml-ast';
import { DEFAULT_AUTOMOD_RULE, parseAutomodRuleDraft, buildRichContextPrompt, extractYamlFromFenced, type RichContext } from '../../shared/automod';
import type { BlastRadiusResult } from '../../shared/blast-types';
import type { DebugResponse } from '../../shared/debug-types';
import DebugResultCard from './DebugResultCard';
import { formatDebugMessage, parsePostId } from '../utils/debug';
import TypingIndicator from './TypingIndicator';
import QuickSuggestions from './QuickSuggestions';
import EmptyState from './EmptyState';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';

function ApiKeyModal({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (key: string) => void }) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const storedKey = localStorage.getItem('gemini_api_key') || '';
      setKey(storedKey);
    }
  }, [isOpen]);

  const handleSave = () => {
    const trimmedKey = key.trim();
    localStorage.setItem('gemini_api_key', trimmedKey);
    console.log('[ChatMode] Saved API key to localStorage, length:', trimmedKey.length);
    onSave(trimmedKey);
    onClose();
  };

  const handleClear = () => {
    localStorage.removeItem('gemini_api_key');
    setKey('');
    onSave('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-[#333] bg-[#1C1C1C] p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold text-[--foreground]">Gemini API Key</h3>
        <p className="mb-4 text-sm text-[--muted-foreground]">
          Enter your Gemini API key to use the chat feature. Your key is stored locally in your browser.
        </p>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-[--muted-foreground]">API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy..."
              className="flex-1 rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-sm text-[--foreground] outline-none focus:border-[--primary] focus:ring-2 focus:ring-[--primary]/50"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--muted-foreground] hover:border-[--primary]/50 hover:text-[--primary]"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {key && (
            <button
              onClick={handleClear}
              className="rounded-xl border border-[--border] bg-[--surface-3] px-4 py-2 text-sm text-[--danger] hover:bg-[--danger]/10"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-xl border border-[--border] bg-[--surface-3] px-4 py-2 text-sm text-[--foreground] hover:bg-[--surface-2]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className="rounded-xl bg-[--primary] px-4 py-2 text-sm font-semibold text-[--primary-foreground] transition-colors hover:bg-[--primary]/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

type EscapeHatchResult = {
  triggerCode: string;
  description: string;
  limitations: string[];
  installationSteps: string[];
  confidence: 'high' | 'medium' | 'low';
};

type UnifiedResponse = {
  status: 'success';
  analysis: {
    needsYaml: boolean;
    needsTypeScript: boolean;
    yamlPart: string;
    typescriptPart: string;
    explanation: string;
  };
  yamlResponse: string | null;
  escapeHatch: EscapeHatchResult | null;
};

interface ChatModeProps {
  ast: AutomodAST;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onApplyAST: (ast: AutomodAST) => void;
  onApplyYaml: (yaml: string) => void;
  subredditName?: string | undefined;
  contextYaml?: string | undefined;
  onClearMessages?: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const APPLY_INTENT_RE =
  /^\s*(yeah[\s,]*(good[\s,]*)?)?(ok[\s,]*|yes[\s,]*|sure[\s,]*|looks?\s+good[\s,]*|perfect[\s,]*|great[\s,]*|awesome[\s,]*)?(apply|use\s+(this|these|it)|add\s+(this|these|it)|implement\s+(this|it)|do\s+it|go\s+ahead|use\s+this\s+rule)\s*[.!]?\s*$/i;

function extractLastYaml(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const msg = messages[index];

    if (!msg || msg.role !== 'assistant') {
      continue;
    }

    const yaml = extractYamlFromFenced(msg.content);
    if (yaml) {
      return yaml;
    }
  }

  return null;
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

function TypeScriptTriggerCard({ escapeHatch }: { escapeHatch: EscapeHatchResult }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(escapeHatch.triggerCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded-2xl border border-[--primary]/20 bg-[--surface-2]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[--border]">
        <span className="text-xs font-medium text-[--primary]">
          ⚡ TypeScript Trigger Required
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${
          escapeHatch.confidence === 'high'
            ? 'bg-[--success]/15 text-[--success] border-[--success]/25'
            : escapeHatch.confidence === 'medium'
            ? 'bg-[--warning]/15 text-[--warning] border-[--warning]/25'
            : 'bg-[--danger]/15 text-[--danger] border-[--danger]/25'
        }`}>
          {escapeHatch.confidence} confidence
        </span>
      </div>
      <div className="p-3">
        <p className="text-xs text-[--muted-foreground] mb-2">{escapeHatch.description}</p>
        <pre className="max-h-48 overflow-auto rounded-xl bg-[--surface-3] p-3 font-mono text-xs leading-5 text-[--foreground]">
          {escapeHatch.triggerCode}
        </pre>
        <button
          onClick={handleCopy}
          className="mt-2 text-xs text-[--primary] hover:text-[--primary]/80 transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy trigger code'}
        </button>
        {escapeHatch.limitations.length > 0 && (
          <div className="mt-2 text-xs text-[--muted-foreground]">
            <p className="font-medium mb-1">Limitations:</p>
            {escapeHatch.limitations.map((l, i) => (
              <p key={i}>— {l}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onApply,
  applied,
  onCopy,
  onRegenerate,
  onEdit,
  isLastMessage,
}: {
  msg: ChatMessage;
  onApply: ((yaml: string) => void) | undefined;
  applied: boolean;
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  onEdit?: (msgId: string, content: string) => void;
  isLastMessage: boolean;
}) {
  const [justApplied, setJustApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const debugResult = msg.debugResult;
  const yamlMatch = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
  const yamlValue = yamlMatch?.[1] ?? '';
  const textParts = msg.content.split(/```(?:yaml)?\n[\s\S]*?```/);

  // Check if YAML has actual content (not empty/default/template)
  const hasRealYaml = yamlValue && !yamlValue.includes("# Rule draft") && !yamlValue.includes("title (includes): ['']") && yamlValue.trim().length > 50;

  // Check if debug result has real YAML - only show card if there's actual YAML to apply
  const hasRealDebugYaml = debugResult?.aiFixYaml && !debugResult.aiFixYaml.includes("# Rule draft") && !debugResult.aiFixYaml.includes("title (includes): ['']") && debugResult.aiFixYaml.trim().length > 50;

  // Check if the message content itself contains template YAML
  const hasTemplateYaml = msg.content.includes("# Rule draft") || msg.content.includes("title (includes): ['']");

  const handleApply = (yaml: string) => {
    if (!onApply) {
      return;
    }

    const sanitized = yaml.replace(
      /^(\s*(?:title|body)\s*\(matches\)\s*:\s*\[')(.*?)('\])\s*$/gm,
      (_, prefix, inner, suffix) => `${prefix}${inner.replace(/''/g, "\\'")}${suffix}`
    );
    onApply(sanitized);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 3000);
  };

  const handleCopy = async () => {
    if (onCopy) {
      await onCopy(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const showApplied = justApplied || applied;

  // Don't render the message at all if it contains template YAML
  if (hasTemplateYaml && !hasRealYaml && !hasRealDebugYaml) {
    return null;
  }

  // Render escape hatch card if present
  if (msg.escapeHatch) {
    return (
      <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            msg.role === 'user'
              ? 'bg-gradient-to-br from-purple-400 to-pink-400 text-white'
              : 'bg-[#1E192B] border border-[rgba(255,255,255,0.08)] text-[#EDE8F5] shadow-sm'
          }`}
        >
          {msg.role === 'user' ? '👤' : '✳'}
        </div>
        <div className="max-w-[85%] sm:max-w-[82%]">
          <TypeScriptTriggerCard escapeHatch={msg.escapeHatch} />
          <div className="mt-1.5 text-[10px] text-[#8B7FA8]">{new Date(msg.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          msg.role === 'user'
            ? 'bg-gradient-to-br from-purple-400 to-pink-400 text-white'
            : 'bg-[--surface-2] border border-[--border] text-[--foreground] shadow-sm'
        }`}
      >
        {msg.role === 'user' ? '👤' : '✳'}
      </div>
      <div className="flex-1">
        <div
          className={`max-w-[85%] sm:max-w-[82%] rounded-2xl p-2.5 sm:p-3.5 text-sm ${
            msg.role === 'user'
              ? 'bg-[--primary]/15 border border-[--primary]/25 text-[--foreground] rounded-br-2xl self-end'
              : 'bg-[--surface-2] border border-[--border] text-[--foreground] rounded-bl-2xl self-start shadow-sm'
          }`}
        >
          {hasRealDebugYaml ? (
            <DebugResultCard result={debugResult} onApplyYaml={handleApply} />
          ) : (
            textParts.map((part, index) => (
              <span key={index}>
                {part && <p className="whitespace-pre-wrap text-sm leading-relaxed text-[--foreground]">{part}</p>}
                {index === 0 && hasRealYaml && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-[--border] bg-[--surface-3]">
                    <div className="flex items-center justify-between bg-[--surface-2] px-3 py-1.5 border-b border-[--border]">
                      <span className="font-mono text-[10px] text-[--muted-foreground]">yaml</span>
                      {onApply !== undefined && (
                        <button
                          onClick={() => handleApply(yamlValue)}
                          className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-200 ${
                            showApplied ? 'text-[--success]' : 'text-[--primary] hover:text-[--primary]/80'
                          }`}
                        >
                          {showApplied ? (
                            <>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
                    <pre className="overflow-auto whitespace-pre-wrap wrap-break-word bg-[--surface-3] p-3 font-mono text-xs leading-6 text-[--foreground]">
                      {yamlValue}
                    </pre>
                  </div>
                )}
              </span>
            ))
          )}
        </div>
        
        {/* Action buttons */}
        {msg.role === 'assistant' && (
          <div className="flex gap-2 mt-2 ml-1">
            {onCopy && (
              <button
                onClick={handleCopy}
                className="text-[10px] text-[--muted-foreground] hover:text-[--primary] transition-colors flex items-center gap-1"
                title="Copy message"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            )}
            {onRegenerate && isLastMessage && (
              <button
                onClick={onRegenerate}
                className="text-[10px] text-[--muted-foreground] hover:text-[--primary] transition-colors flex items-center gap-1"
                title="Regenerate response"
              >
                🔄 Regenerate
              </button>
            )}
          </div>
        )}
        
        {msg.role === 'user' && onEdit && (
          <div className="flex gap-2 mt-2 mr-1 justify-end">
            <button
              onClick={() => onEdit(msg.id, msg.content)}
              className="text-[10px] text-[--muted-foreground] hover:text-[--primary] transition-colors flex items-center gap-1"
              title="Edit message"
            >
              ✏️ Edit
            </button>
          </div>
        )}
        
        <div className="mt-1.5 text-[10px] text-[--muted-foreground]">{new Date(msg.timestamp).toLocaleTimeString()}</div>
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
  onClearMessages,
}: ChatModeProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const [subredditContext, setSubredditContext] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key') || '';
    console.log('[ChatMode] Loaded API key from localStorage:', !!storedKey, 'length:', storedKey.length);
    setApiKey(storedKey);
  }, []);

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
        const response = await fetch('/api/rule-stage/context');
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && isActive) {
            const richContext: RichContext = {
              subredditName: data.subredditName,
              subscribers: data.subscribers ?? 0,
              rules: data.rules ?? [],
              liveYaml: data.liveYaml ?? '',
              postFlairs: data.postFlairs ?? [],
              userFlairs: data.userFlairs ?? [],
              removalReasons: data.removalReasons ?? [],
              moderators: data.moderators ?? [],
            };
            setSubredditContext(buildRichContextPrompt(richContext));
          }
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

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      console.log('[ChatMode] Message copied to clipboard');
    }).catch((error) => {
      console.error('[ChatMode] Failed to copy message:', error);
    });
  };

  const handleRegenerate = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      setInput(lastUserMessage.content);
      void sendMessage(lastUserMessage.content);
    }
  };

  const handleEditMessage = (msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditedContent(content);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (editingMessageId && editedContent.trim()) {
      // Re-send the edited message
      setInput(editedContent);
      setShowEditDialog(false);
      setEditingMessageId(null);
      setEditedContent('');
      void sendMessage(editedContent);
    }
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear this conversation?')) {
      if (onClearMessages) {
        onClearMessages();
      }
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    console.log('[ChatMode] sendMessage called - apiKey present:', !!apiKey, 'apiKey length:', apiKey.length);
    if (!apiKey) {
      console.log('[ChatMode] No API key, showing modal');
      setShowApiKeyModal(true);
      return;
    }

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

      const history = messages
        .slice(-6)
        .map((message) => ({
          role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
          content: message.role === 'assistant' && message.content.includes('```yaml')
            ? '[Previous YAML response — omitted from context]'
            : message.content,
        }));

      let contextual = trimmed;
      const currentYaml = contextYaml ?? (ast.length > 0 ? astToYaml(ast) : '');
      if (currentYaml) {
        contextual = `Current rules:\n\`\`\`yaml\n${currentYaml}\n\`\`\`\n\nRequest: ${trimmed}`;
      }

      // Silent retry logic - no UI updates during retries
      let attempt = 0;
      const maxAttempts = 3;
      let lastError: Error | null = null;

      while (attempt < maxAttempts) {
        attempt++;

        try {
          console.log(`[ChatMode] Attempt ${attempt}/${maxAttempts} (silent)`);

          const chatResponse = await fetch('/api/rule-stage/chat-unified', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: contextual,
              history,
              subredditContext,
              apiKey,
            }),
          });

          if (!chatResponse.ok) {
            const payload = (await chatResponse.json().catch(() => null)) as { message?: string } | null;
            throw new Error(payload?.message || 'Failed to fetch chat response');
          }

          const unified = await chatResponse.json() as UnifiedResponse;

          if (unified.yamlResponse) {
            const msgId = genId();
            onAddMessage({
              id: msgId,
              role: 'assistant',
              content: unified.yamlResponse,
              timestamp: Date.now(),
            });

            const yamlInReply = extractYamlFromFenced(unified.yamlResponse);
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
          }

          if (unified.escapeHatch) {
            onAddMessage({
              id: genId(),
              role: 'assistant',
              content: '__escape_hatch__',
              timestamp: Date.now(),
              escapeHatch: unified.escapeHatch,
            });
          }

          if (!unified.analysis.needsYaml && unified.escapeHatch) {
            onAddMessage({
              id: genId(),
              role: 'assistant',
              content: `ℹ️ This requirement cannot be handled by AutoMod YAML. ${unified.analysis.explanation} A TypeScript trigger has been generated above — deploy it via \`npm run deploy\`.`,
              timestamp: Date.now(),
            });
          }

          // Success - exit retry loop
          break;

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[ChatMode] Attempt ${attempt} failed:`, lastError.message);

          const message = lastError.message.toLowerCase();
          const isRetryable = 
            message.includes('grpc') ||
            message.includes('deadline') ||
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('connection');

          if (!isRetryable || attempt >= maxAttempts) {
            break;
          }

          // Wait before retry (silent - no UI update)
          const delay = Math.min(10000, 1000 * Math.pow(2, attempt - 1));
          console.log(`[ChatMode] Waiting ${delay}ms before retry (silent)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (lastError) {
        setError(lastError.message);
        onAddMessage({
          id: genId(),
          role: 'assistant',
          content: `⚠️ **Error:** ${lastError.message}\n\nPlease try again or use a shorter prompt.`,
          timestamp: Date.now(),
        });
      }
    } catch (caughtError) {
      const errorMsg = caughtError instanceof Error ? caughtError.message : 'Unknown error';
      console.error('[ChatMode] Error:', errorMsg);
      setError(errorMsg);
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
    <div className="flex flex-1 flex-col overflow-hidden bg-[--surface-2]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2 border-b border-[--border] shadow-sm">
        <div className="flex items-center gap-1">
        </div>
        <div className="flex items-center gap-8">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearChat}
            className="text-sm text-[--muted-foreground] hover:text-[--danger] hover:bg-[--danger]/10 font-medium"
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowApiKeyModal(true)}
            className="text-sm text-[--muted-foreground] hover:text-[--primary] hover:bg-[--primary]/10 font-medium"
            title="Configure API Key"
          >
            Settings
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4 md:py-6 bg-[--surface-2]">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const bubbleProps: {
                msg: ChatMessage;
                applied: boolean;
                onApply: ((yaml: string) => void) | undefined;
                isLastMessage: boolean;
                onCopy?: (content: string) => void;
                onRegenerate?: () => void;
                onEdit?: (msgId: string, content: string) => void;
              } = {
                msg,
                applied: appliedMsgId === msg.id,
                onApply: msg.role === 'assistant' ? (yaml) => handleApplyYaml(yaml, msg.id) : undefined,
                isLastMessage: index === messages.length - 1,
              };

              if (msg.role === 'assistant') {
                bubbleProps.onCopy = handleCopyMessage;
                if (index === messages.length - 1) {
                  bubbleProps.onRegenerate = handleRegenerate;
                }
              } else if (msg.role === 'user') {
                bubbleProps.onEdit = handleEditMessage;
              }

              return <MessageBubble key={msg.id} {...bubbleProps} />;
            })}

            {error && (
              <div className="rounded-2xl border border-[--danger]/30 bg-[--danger]/15 p-3 text-xs text-[--danger] shadow-sm">
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-[--border] bg-[--surface-2] px-4 md:px-6 py-4 md:py-5 shadow-lg">
        {isLoading && (
          <div className="flex items-center gap-2 mb-3 text-xs text-[--muted-foreground]">
            <TypingIndicator />
            <span>Thinking...</span>
          </div>
        )}
        
        {messages.length === 0 && !isLoading && (
          <QuickSuggestions
            onSelectSuggestion={(suggestion) => {
              setInput(suggestion);
            }}
            className="mb-3"
          />
        )}
        
        <div className="flex items-end gap-2 sm:gap-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder='Ask me to create rules... or type "apply" to use the last rule'
            rows={2}
            data-testid="chat-input"
            className="min-h-13.5 flex-1 resize-none rounded-2xl border border-[--border] bg-[--surface-3] px-3 sm:px-4 py-3 text-sm text-[--foreground] outline-none transition-colors placeholder:text-[--subtle] focus:border-[--primary] focus:ring-2 focus:ring-[--primary]/50 disabled:opacity-50"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            data-testid="btn-send"
            className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-[--primary] text-[--primary-foreground] transition-colors hover:bg-[--primary]/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 7.5L13 2L8.5 13L7 8.5L2 7.5Z" fill="currentColor" />
            </svg>
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-[--subtle] hidden sm:block">Shift+Enter for new line · Enter to send · Ctrl+Enter to send</p>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={4}
            className="mt-4"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save & Re-send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSave={(key) => {
          console.log('[ChatMode] ApiKeyModal onSave called with key length:', key.length);
          setApiKey(key);
        }}
      />
    </div>
  );
}
