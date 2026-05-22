import { useState, useRef, useEffect } from "react";
import type { ViewMode } from "../types";

interface AppHeaderProps {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  ruleCount: number;
  yaml: string;
  onRunSimulation: () => void;
  isSimulating: boolean;
  geminiApiKey: string;
  onOpenApiKey: () => void;
  onToggleHistory: () => void;
  historyActive: boolean;
  snapshotCount: number;
}

const MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "code", label: "Code", icon: "⌨" },
  { id: "drag", label: "Drag", icon: "⬡" },
  { id: "chat", label: "Chat", icon: "✦" },
];

export default function AppHeader({
  mode,
  setMode,
  ruleCount,
  yaml,
  onRunSimulation,
  isSimulating,
  geminiApiKey,
  onOpenApiKey,
  onToggleHistory,
  historyActive,
  snapshotCount,
}: AppHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    if (exportOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = yaml;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    }
    setExportOpen(false);
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automoderator-config.yaml";
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  return (
    <header className="h-[60px] bg-[#1A1020] border-b border-white/10 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 shrink-0 overflow-x-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-0 sm:mr-2 shrink-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#F5C842] flex items-center justify-center">
          <span className="text-[#1A1020] font-bold text-xs sm:text-sm">✳</span>
        </div>
        <span className="font-bold text-[#1A1020] text-xs sm:text-sm tracking-tight hidden sm:block">ChaTin</span>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 bg-white/8 rounded-full p-1 border border-white/10 shrink-0">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            data-testid={`tab-${m.id}`}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 ${
              mode === m.id
                ? 'bg-[#F5C842] text-[#1A1020] shadow-sm'
                : 'text-white/50 hover:text-white rounded-full'
            }`}
          >
            <span className="text-xs opacity-80">{m.icon}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Rule count */}
      <span className="text-xs font-mono px-2 py-0.5 rounded border bg-[#58A6FF]/10 text-[#58A6FF] border-[#58A6FF]/30 shrink-0">
        {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
      </span>

      <div className="flex-1 min-w-[8px]" />

      {/* Gemini key status */}
      <button
        onClick={onOpenApiKey}
        data-testid="btn-api-key"
        className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border transition-colors shrink-0 ${
          geminiApiKey
            ? 'border-[#3FB950]/30 bg-[#3FB950]/10 text-[#3FB950]'
            : 'border-white/15 bg-white/8 text-white/60 hover:text-white hover:bg-white/12'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${geminiApiKey ? "bg-[#3FB950]" : "bg-[#484F58]"}`} />
        <span className="hidden sm:inline">{geminiApiKey ? "AI Ready" : "Add API Key"}</span>
        <span className="sm:hidden">{geminiApiKey ? "✓" : "+"}</span>
      </button>

      {/* History button */}
      <button
        onClick={onToggleHistory}
        data-testid="btn-history"
        className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border transition-colors shrink-0 ${
          historyActive
            ? 'border-[#BC8CFF]/40 bg-[#BC8CFF]/10 text-[#BC8CFF]'
            : 'border-white/15 bg-white/8 text-white/60 hover:text-white hover:bg-white/12'
        }`}
        title="Version History"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">History</span>
        {snapshotCount > 0 && (
          <span className={`text-[10px] font-mono px-1 rounded ${historyActive ? "text-[#BC8CFF]" : "text-[#484F58]"}`}>
            {snapshotCount}
          </span>
        )}
      </button>

      {/* Export dropdown */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setExportOpen((o) => !o)}
          disabled={ruleCount === 0}
          data-testid="btn-export"
          className="flex items-center gap-1.5 border-white/15 bg-white/8 text-white/60 hover:text-white hover:bg-white/12 font-medium px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1V9M6.5 9L4 6.5M6.5 9L9 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M1 10.5V11.5C1 11.8 1.2 12 1.5 12H11.5C11.8 12 12 11.8 12 11.5V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Export</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`transition-transform duration-150 ${exportOpen ? "rotate-180" : ""}`}
          >
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#EBEBEB] rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-[#EBEBEB]">
              <p className="text-[10px] text-[#666666] font-semibold uppercase tracking-wider">Export {ruleCount} rule{ruleCount !== 1 ? 's' : ''}</p>
            </div>

            <button onClick={handleCopy} data-testid="btn-copy-yaml" className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F4F4F4] transition-colors text-left">
              <div className="w-7 h-7 rounded-md bg-[#58A6FF]/10 border border-[#58A6FF]/20 flex items-center justify-center shrink-0">
                {copyState === 'copied' ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 7L5 10L11 3" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="4" y="1" width="8" height="9" rx="1.5" stroke="#58A6FF" strokeWidth="1.2" />
                    <rect x="1" y="3" width="8" height="9" rx="1.5" fill="#FFFFFF" stroke="#58A6FF" strokeWidth="1.2" />
                  </svg>
                )}
              </div>
              <div>
                <div className={`text-sm font-medium ${copyState === 'copied' ? 'text-[#3FB950]' : 'text-[#1A1020]'}`}>{copyState === 'copied' ? 'Copied!' : 'Copy to Clipboard'}</div>
                <div className="text-[10px] text-[#666666]">Paste into Reddit's AutoMod wiki</div>
              </div>
            </button>

            <button onClick={handleDownload} data-testid="btn-download-yaml" className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F4F4F4] transition-colors text-left">
              <div className="w-7 h-7 rounded-md bg-[#3FB950]/10 border border-[#3FB950]/20 flex items-center justify-center shrink-0">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1V8M6.5 8L4 5.5M6.5 8L9 5.5" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1 10V11.5C1 11.8 1.2 12 1.5 12H11.5C11.8 12 12 11.8 12 11.5V10" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-[#1A1020]">Download .yaml</div>
                <div className="text-[10px] text-[#666666]">automoderator-config.yaml</div>
              </div>
            </button>

            <div className="px-3 py-2 border-t border-[#EBEBEB] bg-white">
              <p className="text-[10px] text-[#666666] leading-relaxed">Paste into <span className="font-mono">r/yoursubreddit/wiki/config/automoderator</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Dry Run */}
      <button
        onClick={onRunSimulation}
        disabled={isSimulating || ruleCount === 0}
        data-testid="btn-dry-run"
        className="flex items-center gap-2 bg-[#F5C842] hover:bg-[#e6b93c] text-[#1A1020] font-semibold px-3 sm:px-5 py-2 rounded-[14px] text-xs sm:text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {isSimulating ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="animate-spin">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="7 7" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2L11 6.5L2 11V2Z" fill="currentColor" />
          </svg>
        )}
        <span className="hidden sm:inline">{isSimulating ? "Running..." : "Dry Run"}</span>
        <span className="sm:hidden">{isSimulating ? "..." : "▶"}</span>
      </button>
    </header>
  );
}