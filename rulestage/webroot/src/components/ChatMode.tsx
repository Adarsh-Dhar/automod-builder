import React, { useState, useRef, useEffect } from "react";
import type { AutomodAST, ChatMessage } from "../types";
import { callGemini, extractASTFromResponse, extractYamlFromResponse } from "../utils/gemini";
import { astToYaml } from "../utils/yaml-ast";

interface ChatModeProps {
  ast: AutomodAST;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  onApplyAST: (ast: AutomodAST) => void;
  geminiApiKey: string;
  onOpenApiKey: () => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const QUICK_PROMPTS = [
  "Block crypto spam posts",
  "Remove posts from new accounts with low karma",
  "Auto-report posts with suspicious URLs",
  "Lock posts that match spam patterns",
  "Block posts with too many capital letters",
];

function MessageBubble({ msg, onApply }: { msg: ChatMessage; onApply?: (yaml: string) => void }) {
  const yamlMatch = msg.content.match(/```(?:yaml)?\n([\s\S]*?)```/);
  const hasYaml = !!yamlMatch;

  return (
    <div className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
          msg.role === "user"
            ? "bg-reddit-orange text-white"
            : "bg-reddit-purple/20 border border-reddit-purple/40 text-reddit-purple"
        }`}
      >
        {msg.role === "user" ? "M" : "AI"}
      </div>
      <div
        className={`max-w-[80%] rounded-lg p-3 text-sm ${
          msg.role === "user"
            ? "bg-reddit-orange/20 border border-reddit-orange/30 text-reddit-text-primary"
            : "bg-reddit-card border border-reddit-border text-reddit-text-primary"
        }`}
      >
        {msg.content.split(/```(?:yaml)?\n[\s\S]*?```/).map((part, i) => (
          <React.Fragment key={i}>
            {part && <p className="whitespace-pre-wrap text-sm leading-relaxed">{part}</p>}
            {i === 0 && yamlMatch && (
              <div className="mt-2 rounded-md overflow-hidden border border-reddit-border">
                <div className="flex items-center justify-between px-3 py-1.5 bg-reddit-darker">
                  <span className="text-xs text-reddit-text-muted font-mono">yaml</span>
                  {onApply && (
                    <button
                      onClick={() => onApply(yamlMatch[1])}
                      className="text-xs text-reddit-orange hover:text-reddit-orange-hover font-semibold transition-colors"
                    >
                      Apply to Rules
                    </button>
                  )}
                </div>
                <pre className="text-xs font-mono text-reddit-green p-3 bg-reddit-dark overflow-auto max-h-48">
                  {yamlMatch[1]}
                </pre>
              </div>
            )}
          </React.Fragment>
        ))}
        <div className="text-[10px] text-reddit-text-muted mt-1.5">
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
  onApplyAST,
  geminiApiKey,
  onOpenApiKey,
}: ChatModeProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const applyYaml = (yamlStr: string) => {
    const { yamlToAST } = require("../utils/yaml-ast");
    const newAst = yamlToAST(yamlStr);
    if (newAst.length > 0) {
      onApplyAST(newAst);
    }
  };

  const handleApplyYaml = (yamlStr: string) => {
    import("../utils/yaml-ast").then(({ yamlToAST }) => {
      const newAst = yamlToAST(yamlStr);
      if (newAst.length > 0) {
        onApplyAST(newAst);
      }
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!geminiApiKey) {
      onOpenApiKey();
      return;
    }

    setError(null);
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text.trim(),
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

      let contextualMessage = text.trim();
      if (ast.length > 0) {
        const currentYaml = astToYaml(ast);
        contextualMessage = `Current rules:\n\`\`\`yaml\n${currentYaml}\n\`\`\`\n\nUser request: ${text.trim()}`;
      }

      const response = await callGemini(geminiApiKey, contextualMessage, history);

      const aiMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };
      onAddMessage(aiMsg);
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
    <div className="h-full flex flex-col">
      {/* No API key warning */}
      {!geminiApiKey && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-reddit-yellow/10 border-b border-reddit-yellow/30">
          <span className="text-xs text-reddit-yellow">
            Gemini API key required for Chat mode
          </span>
          <button onClick={onOpenApiKey} className="text-xs text-reddit-orange hover:underline font-semibold">
            Add key
          </button>
        </div>
      )}

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="shrink-0 p-4 border-b border-reddit-border">
          <div className="text-xs text-reddit-text-muted mb-2 font-semibold uppercase tracking-wider">
            Quick prompts
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={!geminiApiKey}
                className="text-xs px-3 py-1.5 rounded-full bg-reddit-card hover:bg-reddit-border border border-reddit-border text-reddit-text-secondary hover:text-reddit-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 opacity-50">
            <div className="text-3xl">✦</div>
            <p className="text-reddit-text-muted text-sm text-center">
              Describe the moderation behavior you want.<br />
              The AI will generate AutoModerator rules for you.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onApply={msg.role === "assistant" ? handleApplyYaml : undefined}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-reddit-purple/20 border border-reddit-purple/40 flex items-center justify-center text-xs font-bold text-reddit-purple shrink-0">
              AI
            </div>
            <div className="bg-reddit-card border border-reddit-border rounded-lg p-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-reddit-purple thinking-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-reddit-purple thinking-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-reddit-purple thinking-dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-reddit-red/10 border border-reddit-red/30 text-xs text-reddit-red">
            Error: {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 p-4 border-t border-reddit-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !geminiApiKey}
            placeholder={
              geminiApiKey
                ? "Describe what you want to moderate... (Enter to send)"
                : "Add Gemini API key to use Chat mode"
            }
            rows={2}
            className="flex-1 bg-reddit-card border border-reddit-border rounded-lg px-3 py-2 text-sm text-reddit-text-primary resize-none focus:outline-none focus:border-reddit-blue placeholder:text-reddit-text-muted disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || !geminiApiKey}
            className="shrink-0 w-9 h-9 rounded-lg bg-reddit-orange hover:bg-reddit-orange-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8L14 2L8 14L7 9L2 8Z" fill="white" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-reddit-text-muted mt-1.5">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
