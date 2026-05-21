import { useState, useRef, useEffect } from "react";
import type { AutomodAST, ChatMessage } from "../types";
import { callGemini } from "../utils/gemini";
import { astToYaml } from "../utils/yaml-ast";

interface ChatModeProps {
  ast: AutomodAST;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onApplyAST: (ast: AutomodAST) => void;
  onApplyYaml: (yaml: string) => void;
  geminiApiKey: string;
}

  function genId(): string {
    return Math.random().toString(36).slice(2, 9);
  }

  // const QUICK_PROMPTS = []; // Removed empty prompt array

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
            ? "bg-[#FF6B35] text-white"
            : "bg-white border border-[#E5E8F0] text-[#6C5CE7] shadow-sm"
        }`}
      >
        {msg.role === "user" ? "M" : "AI"}
      </div>
      <div
        className={`max-w-[82%] rounded-[20px] p-3 text-sm shadow-sm ${
          msg.role === "user"
            ? "bg-[#FFF1E9] border border-[#FFD7C4] text-[#1F2937]"
            : "bg-white border border-[#E7EAF1] text-[#1F2937]"
        }`}
      >
        {textParts.map((part, i) => (
          <span key={i}>
            {part && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1F2937]">{part}</p>
            )}
            {i === 0 && yamlMatch && (
              <div className="mt-2 overflow-hidden rounded-xl border border-[#E7EAF1] bg-white">
                <div className="flex items-center justify-between bg-[#FBFCFF] px-3 py-1.5">
                  <span className="font-mono text-[10px] text-[#8B93A5]">yaml</span>
                  {onApply && (
                    <button
                      onClick={() => handleApply(yamlMatch[1])}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-200 ${
                        showApplied
                          ? "text-[#22A06B]"
                          : "text-[#FF6B35] hover:text-[#F35B20]"
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
                <pre className="max-h-48 overflow-auto bg-[#FBFCFF] p-3 font-mono text-xs text-[#0F766E]">
                  {yamlMatch[1]}
                </pre>
              </div>
            )}
          </span>
        ))}
        <div className="mt-1.5 text-[10px] text-[#8B93A5]">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
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
  geminiApiKey,
  onOpenApiKey,
}: ChatModeProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleApplyYaml = (yamlStr: string, msgId: string) => {
    onApplyYaml(yamlStr);
    setAppliedMsgId(msgId);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!geminiApiKey) {
      setError('Missing Gemini API key in environment');
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

      const response = await callGemini(geminiApiKey, contextual, history);
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
      void sendMessage(input);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-[#E7E9F0] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">

      <div className="flex-1 overflow-auto bg-[#FBFCFF] px-4 py-5 sm:px-6 sm:py-6">
        {messages.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-[#8B93A5]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#E7EAF1] bg-white text-[#FF6B35] shadow-sm">
              ✦
            </div>
            <p className="max-w-sm text-sm leading-6">
              Describe what you want to moderate.
              <br />
              Gemini will draft AutoModerator rules for you.
            </p>
          </div>
        )}

        <div className="space-y-4">
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E5E8F0] bg-white text-[11px] font-semibold text-[#6C5CE7] shadow-sm">
                AI
              </div>
              <div className="rounded-2xl border border-[#E5E8F0] bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-[#6C5CE7]"
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

      <div className="shrink-0 border-t border-[#E7E9F0] bg-white px-4 py-4 sm:px-6">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !geminiApiKey}
            placeholder={
              geminiApiKey
                ? `Write a message… or type "apply" to use the last rule`
                : "Add Gemini API key to use Chat mode"
            }
            rows={2}
            data-testid="chat-input"
            className="min-h-13.5 flex-1 resize-none rounded-[18px] border border-[#E5E8F0] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#FFB08A] disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || !geminiApiKey}
            data-testid="btn-send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#FF6B35] text-white shadow-[0_12px_24px_rgba(255,107,53,0.25)] transition-colors hover:bg-[#F35B20] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 7.5L13 2L8.5 13L7 8.5L2 7.5Z" fill="white" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#8B93A5]">
          Shift+Enter for new line · Enter to send · type "apply" to use last rule
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
