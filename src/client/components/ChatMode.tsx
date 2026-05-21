import { useState, useRef, useEffect } from "react";
import type { AutomodAST, ChatMessage } from "../types";
import { callGemini } from "../utils/gemini";
import { astToYaml } from "../utils/yaml-ast";
import {
  fetchSubredditContext,
  buildSubredditContextPrompt,
} from "../utils/reddit";
import type { SubredditContext } from "../utils/reddit";

interface ChatModeProps {
  ast: AutomodAST;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onApplyAST: (ast: AutomodAST) => void;
  onApplyYaml: (yaml: string) => void;
  geminiApiKey: string;
  onOpenApiKey: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const QUICK_PROMPTS = [
  "Block crypto and NFT spam",
  "Remove posts from accounts with very low karma",
  "Auto-report posts with suspicious short links",
  "Flag posts from brand new accounts",
  "Remove posts that look like get-rich-quick schemes",
];

const APPLY_INTENT_RE =
  /^\s*(yeah[,\s]*(good[,\s]*)?)?(ok[,\s]*|yes[,\s]*|sure[,\s]*|looks?\s+good[,\s]*|perfect[,\s]*|great[,\s]*|awesome[,\s]*)?(apply|use\s+(this|these|it)|add\s+(this|these|it)|implement\s+(this|it)|do\s+it|go\s+ahead|use\s+this\s+rule)\s*[.!]?\s*$/i;

function extractLastYaml(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const match = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
    if (match) return match[1].trim();
  }
  return null;
}

function MessageBubble({
  msg,
  onApply,
  applied,
}: {
  msg: ChatMessage;
  onApply?: (yaml: string) => void;
  applied: boolean;
}) {
  const [justApplied, setJustApplied] = useState(false);
  const yamlMatch = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
  const textParts = msg.content.split(/```(?:yaml)?\n[\s\S]*?```/);

  const handleApply = (yaml: string) => {
    if (!onApply) return;
    onApply(yaml);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 3000);
  };

  const showApplied = justApplied || applied;

  return (
    <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
          msg.role === "user"
            ? "bg-[#FF4500] text-white"
            : "bg-[#BC8CFF]/20 border border-[#BC8CFF]/40 text-[#BC8CFF]"
        }`}
      >
        {msg.role === "user" ? "M" : "AI"}
      </div>
      <div
        className={`max-w-[82%] rounded-lg p-3 text-sm ${
          msg.role === "user"
            ? "bg-[#FF4500]/20 border border-[#FF4500]/30 text-[#E6EDF3]"
            : "bg-[#161B22] border border-[#21262D] text-[#E6EDF3]"
        }`}
      >
        {textParts.map((part, i) => (
          <span key={i}>
            {part && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{part}</p>
            )}
            {i === 0 && yamlMatch && (
              <div className="mt-2 rounded-md overflow-hidden border border-[#21262D]">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#090D13]">
                  <span className="text-[10px] text-[#484F58] font-mono">yaml</span>
                  {onApply && (
                    <button
                      onClick={() => handleApply(yamlMatch[1])}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-200 ${
                        showApplied
                          ? "text-[#3FB950]"
                          : "text-[#FF4500] hover:text-[#E03D00]"
                      }`}
                    >
                      {showApplied ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
                <pre className="text-xs font-mono text-[#3FB950] p-3 bg-[#0D1117] overflow-auto max-h-48">
                  {yamlMatch[1]}
                </pre>
              </div>
            )}
          </span>
        ))}
        <div className="text-[10px] text-[#484F58] mt-1.5">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function SubredditContextBar({
  ctx,
  onFetch,
}: {
  ctx: SubredditContext | null;
  onFetch: (name: string) => Promise<void>;
}) {
  const [input, setInput] = useState(ctx?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!input.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await onFetch(input.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-[#21262D] bg-[#090D13]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#484F58] uppercase tracking-wider shrink-0">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5.5C3.5 4.4 4.4 3.5 5.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Subreddit
        </div>
        <div className="flex-1 flex items-center gap-1.5 bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1">
          <span className="text-[#484F58] text-xs">r/</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="subreddit name"
            className="flex-1 bg-transparent text-xs text-[#E6EDF3] focus:outline-none placeholder:text-[#484F58]"
            data-testid="input-subreddit"
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={loading || !input.trim()}
          data-testid="btn-fetch-subreddit"
          className="text-xs bg-[#161B22] hover:bg-[#21262D] border border-[#21262D] text-[#E6EDF3] px-2.5 py-1 rounded transition-colors disabled:opacity-40 font-medium shrink-0"
        >
          {loading ? "…" : "Load"}
        </button>
      </div>

      {error && (
        <div className="px-3 pb-2 text-[10px] text-[#F85149]">{error}</div>
      )}

      {ctx && !error && (
        <div className="px-3 pb-2 flex items-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-[#3FB950] font-semibold">
              r/{ctx.name}
            </span>
            <span className="text-[10px] text-[#484F58] ml-2">
              {ctx.subscribers.toLocaleString()} subscribers ·{" "}
              {ctx.rules.length} community rule{ctx.rules.length !== 1 ? "s" : ""}
            </span>
            {ctx.rules.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {ctx.rules.slice(0, 4).map((r, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20 truncate max-w-[140px]"
                    title={r.short_name}
                  >
                    {r.short_name}
                  </span>
                ))}
                {ctx.rules.length > 4 && (
                  <span className="text-[10px] text-[#484F58]">
                    +{ctx.rules.length - 4} more
                  </span>
                )}
              </div>
            )}
            <p className="text-[10px] text-[#484F58] mt-0.5">
              AI will tailor rules to this community's context
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatMode({
  ast,
  messages,
  onAddMessage,
  onApplyAST: _onApplyAST,
  onApplyYaml,
  geminiApiKey,
  onOpenApiKey,
}: ChatModeProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subredditCtx, setSubredditCtx] = useState<SubredditContext | null>(null);
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleApplyYaml = (yamlStr: string, msgId: string) => {
    onApplyYaml(yamlStr);
    setAppliedMsgId(msgId);
  };

  const handleFetchSubreddit = async (name: string) => {
    const ctx = await fetchSubredditContext(name);
    setSubredditCtx(ctx);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!geminiApiKey) {
      onOpenApiKey();
      return;
    }

    const trimmed = text.trim();

    // Detect apply-intent: user says "apply", "yes apply it", "yeah good now apply", etc.
    if (APPLY_INTENT_RE.test(trimmed)) {
      const lastYaml = extractLastYaml(messages);
      if (lastYaml) {
        const userMsg: ChatMessage = {
          id: genId(),
          role: "user",
          content: trimmed,
          timestamp: Date.now(),
        };
        const lastAiMsg = [...messages].reverse().find(
          (m) => m.role === "assistant" && m.content.includes("```")
        );
        const confirmMsg: ChatMessage = {
          id: genId(),
          role: "assistant",
          content:
            "Done! The rules have been applied to your Code editor. Switch to **Code** or **Drag** mode to see them.",
          timestamp: Date.now(),
        };
        onAddMessage(userMsg);
        onApplyYaml(lastYaml);
        if (lastAiMsg) setAppliedMsgId(lastAiMsg.id);
        onAddMessage(confirmMsg);
        setInput("");
        return;
      }
    }

    setError(null);
    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    onAddMessage(userMsg);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        content: m.content,
      }));

      let contextual = trimmed;
      if (ast.length > 0) {
        const currentYaml = astToYaml(ast);
        contextual = `Current rules:\n\`\`\`yaml\n${currentYaml}\n\`\`\`\n\nRequest: ${trimmed}`;
      }

      const subredditContextStr = subredditCtx
        ? buildSubredditContextPrompt(subredditCtx)
        : undefined;

      const response = await callGemini(
        geminiApiKey,
        contextual,
        history,
        subredditContextStr
      );
      onAddMessage({
        id: genId(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0D1117]">
      {!geminiApiKey && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-[#D29922]/10 border-b border-[#D29922]/30">
          <span className="text-xs text-[#D29922]">
            Gemini API key required for Chat mode
          </span>
          <button
            onClick={onOpenApiKey}
            className="text-xs text-[#FF4500] hover:underline font-semibold"
          >
            Add key
          </button>
        </div>
      )}

      <SubredditContextBar ctx={subredditCtx} onFetch={handleFetchSubreddit} />

      {messages.length === 0 && (
        <div className="shrink-0 p-4 border-b border-[#21262D]">
          <div className="text-[10px] text-[#484F58] mb-2 font-semibold uppercase tracking-wider">
            Quick prompts
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={!geminiApiKey}
                className="text-xs px-3 py-1.5 rounded-full bg-[#161B22] hover:bg-[#21262D] border border-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 opacity-40">
            <div className="text-3xl">✦</div>
            <p className="text-[#8B949E] text-sm text-center">
              Describe what you want to moderate.
              <br />
              The AI will generate AutoModerator rules.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            applied={appliedMsgId === msg.id}
            onApply={
              msg.role === "assistant"
                ? (yaml) => handleApplyYaml(yaml, msg.id)
                : undefined
            }
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-[#BC8CFF]/20 border border-[#BC8CFF]/40 flex items-center justify-center text-xs font-bold text-[#BC8CFF] shrink-0">
              AI
            </div>
            <div className="bg-[#161B22] border border-[#21262D] rounded-lg p-3 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#BC8CFF]"
                  style={{
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-[#F85149]/10 border border-[#F85149]/30 text-xs text-[#F85149]">
            Error: {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 p-4 border-t border-[#21262D]">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !geminiApiKey}
            placeholder={
              geminiApiKey
                ? subredditCtx
                  ? `Ask about r/${subredditCtx.name} moderation… or type "apply" to use last rule`
                  : `Describe what to moderate… or type "apply" to use last rule`
                : "Add Gemini API key to use Chat mode"
            }
            rows={2}
            data-testid="chat-input"
            className="flex-1 bg-[#161B22] border border-[#21262D] rounded-lg px-3 py-2 text-sm text-[#E6EDF3] resize-none focus:outline-none focus:border-[#58A6FF] placeholder:text-[#484F58] disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || !geminiApiKey}
            data-testid="btn-send"
            className="shrink-0 w-9 h-9 rounded-lg bg-[#FF4500] hover:bg-[#E03D00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 7.5L13 2L8.5 13L7 8.5L2 7.5Z" fill="white" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-[#484F58] mt-1.5">
          Shift+Enter for new line · Enter to send · type "apply" to use last rule
          {subredditCtx && (
            <span className="ml-2 text-[#3FB950]">
              · r/{subredditCtx.name} context active
            </span>
          )}
        </p>
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
