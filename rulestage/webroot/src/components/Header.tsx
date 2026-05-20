import React from "react";
import type { ViewMode, AutomodAST } from "../types";

interface HeaderProps {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  ast: AutomodAST;
  onRunSimulation: () => void;
  isSimulating: boolean;
  geminiApiKey: string;
  onOpenApiKey: () => void;
  subredditName: string;
  onSaveRules: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  hasPendingChanges: boolean;
}

const MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "code", label: "Code", icon: "⌨️" },
  { id: "drag", label: "Drag", icon: "⬡" },
  { id: "chat", label: "Chat", icon: "✦" },
];

export default function Header({
  mode,
  setMode,
  ast,
  onRunSimulation,
  isSimulating,
  geminiApiKey,
  onOpenApiKey,
  subredditName,
  onSaveRules,
  saveState,
  hasPendingChanges,
}: HeaderProps) {
  return (
    <header className="h-[60px] bg-reddit-darker border-b border-reddit-border flex items-center px-4 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-md bg-reddit-orange flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.9" />
            <rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.6" />
            <rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.6" />
            <rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.3" />
          </svg>
        </div>
        <span className="font-semibold text-reddit-text-primary text-sm tracking-tight">
          RuleStage
        </span>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 bg-reddit-dark rounded-lg p-1 border border-reddit-border">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
              mode === m.id
                ? "bg-reddit-card text-reddit-text-primary shadow-sm"
                : "text-reddit-text-secondary hover:text-reddit-text-primary hover:bg-reddit-border/50"
            }`}
          >
            <span className="text-xs">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Rule count badge */}
      <div className="flex items-center gap-2 ml-2">
        <span className="tag tag-blue">{ast.length} rule{ast.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-md border border-reddit-border bg-reddit-dark text-xs text-reddit-text-secondary">
        <span className="uppercase tracking-[0.18em] text-[10px] text-reddit-text-muted">Subreddit</span>
        <span className="font-medium text-reddit-text-primary">r/{subredditName || "loading"}</span>
      </div>

      <div className="flex-1" />

      {/* Gemini key indicator */}
      <button
        onClick={onOpenApiKey}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
          geminiApiKey
            ? "border-reddit-green/30 bg-reddit-green/10 text-reddit-green hover:bg-reddit-green/20"
            : "border-reddit-border text-reddit-text-muted hover:text-reddit-text-secondary hover:border-reddit-text-muted"
        }`}
        title={geminiApiKey ? "Gemini AI connected" : "Set Gemini API key"}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${geminiApiKey ? "bg-reddit-green" : "bg-reddit-text-muted"}`} />
        {geminiApiKey ? "AI Ready" : "Add API Key"}
      </button>

      <button
        onClick={onSaveRules}
        disabled={!hasPendingChanges || saveState === "saving"}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          saveState === "saved"
            ? "border-[#3FB950]/30 bg-[#3FB950]/10 text-[#3FB950]"
            : saveState === "error"
              ? "border-[#F85149]/30 bg-[#F85149]/10 text-[#F85149]"
              : "border-[#21262D] bg-[#161B22] hover:bg-[#21262D] text-[#E6EDF3]"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            saveState === "saved"
              ? "bg-[#3FB950]"
              : saveState === "error"
                ? "bg-[#F85149]"
                : saveState === "saving"
                  ? "bg-[#58A6FF] animate-pulse"
                  : hasPendingChanges
                    ? "bg-[#FFB000]"
                    : "bg-[#484F58]"
          }`}
        />
        {saveState === "saving"
          ? "Saving..."
          : saveState === "saved"
            ? "Saved"
            : saveState === "error"
              ? "Save failed"
              : hasPendingChanges
                ? "Save to Reddit"
                : "Up to date"}
      </button>

      {/* Simulate button */}
      <button
        onClick={onRunSimulation}
        disabled={isSimulating || ast.length === 0}
        className="flex items-center gap-2 bg-reddit-card hover:bg-reddit-border border border-reddit-border text-reddit-text-primary font-medium px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={isSimulating ? "animate-spin" : ""}>
          {isSimulating ? (
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 8" />
          ) : (
            <path d="M2.5 2.5L11.5 7L2.5 11.5V2.5Z" fill="currentColor" />
          )}
        </svg>
        {isSimulating ? "Running..." : "Dry Run"}
      </button>
    </header>
  );
}
