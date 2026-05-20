import { useState, useCallback, useEffect, useRef } from "react";
import type { AutomodAST, ViewMode, ChatMessage, SimulationDiff } from "./types";
import { yamlToAST, astToYaml } from "./utils/yaml-ast";
import { loadHistory, saveSnapshot } from "./utils/history";
import type { HistorySnapshot } from "./utils/history";
import AppHeader from "./components/AppHeader";
import CodeMode from "./components/CodeMode";
import DragMode from "./components/DragMode";
import ChatMode from "./components/ChatMode";
import SimulationPanel from "./components/SimulationPanel";
import HistoryPanel from "./components/HistoryPanel";
import ApiKeyModal from "./components/ApiKeyModal";

const DEFAULT_YAML = `# RuleStage — Automoderator Configuration
# Switch between Code, Drag, and Chat modes above
# All three views stay in sync via the same JSON rule tree

# Block very low karma accounts
combined_karma: < -10
action: remove
---
# Flag new accounts for review
account_age: < 7
report_reason: New account — needs review
---
# Remove crypto spam
title: (crypto|bitcoin|nft|web3|pump|dump|moon|lambo)
action: spam
`;

const initialAST: AutomodAST = yamlToAST(DEFAULT_YAML);

type RightPanel = "simulation" | "history" | null;

export default function App() {
  const [ast, setAst] = useState<AutomodAST>(initialAST);
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [mode, setMode] = useState<ViewMode>("code");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [simulationDiff, setSimulationDiff] = useState<SimulationDiff | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>(() => loadHistory());

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save snapshot 5 seconds after last yaml change
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const updated = saveSnapshot(yaml, ast.length);
      setSnapshots(updated);
    }, 5000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [yaml, ast.length]);

  const updateFromYaml = useCallback((newYaml: string) => {
    const newAst = yamlToAST(newYaml);
    setYaml(newYaml);
    setAst(newAst);
  }, []);

  const updateFromAST = useCallback((newAst: AutomodAST) => {
    const newYaml = astToYaml(newAst);
    setAst(newAst);
    setYaml(newYaml);
  }, []);

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const applyASTFromChat = useCallback((newAst: AutomodAST) => {
    const newYaml = astToYaml(newAst);
    setAst(newAst);
    setYaml(newYaml);
  }, []);

  const handleSimulationComplete = useCallback((diff: SimulationDiff) => {
    setSimulationDiff(diff);
    setIsSimulating(false);
  }, []);

  const handleRunSimulation = useCallback(() => {
    setRightPanel("simulation");
    setIsSimulating(true);
  }, []);

  const handleToggleHistory = useCallback(() => {
    setRightPanel((p) => (p === "history" ? null : "history"));
  }, []);

  const handleRestoreSnapshot = useCallback((restoredYaml: string) => {
    updateFromYaml(restoredYaml);
    setRightPanel(null);
  }, [updateFromYaml]);

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col font-sans">
      <AppHeader
        mode={mode}
        setMode={setMode}
        ruleCount={ast.length}
        yaml={yaml}
        onRunSimulation={handleRunSimulation}
        isSimulating={isSimulating}
        geminiApiKey={geminiApiKey}
        onOpenApiKey={() => setShowApiKeyModal(true)}
        onToggleHistory={handleToggleHistory}
        historyActive={rightPanel === "history"}
        snapshotCount={snapshots.length}
      />

      <div
        className="flex-1 flex overflow-hidden"
        style={{ height: "calc(100vh - 60px)" }}
      >
        <div className="flex-1 overflow-hidden">
          {mode === "code" && (
            <CodeMode yaml={yaml} ast={ast} onYamlChange={updateFromYaml} />
          )}
          {mode === "drag" && (
            <DragMode ast={ast} onASTChange={updateFromAST} />
          )}
          {mode === "chat" && (
            <ChatMode
              ast={ast}
              messages={chatMessages}
              onAddMessage={addChatMessage}
              onApplyAST={applyASTFromChat}
              onApplyYaml={updateFromYaml}
              geminiApiKey={geminiApiKey}
              onOpenApiKey={() => setShowApiKeyModal(true)}
            />
          )}
        </div>

        {rightPanel === "simulation" && (
          <SimulationPanel
            ast={ast}
            diff={simulationDiff}
            isSimulating={isSimulating}
            onRunSimulation={() => setIsSimulating(true)}
            onSimulationComplete={handleSimulationComplete}
            onClose={() => setRightPanel(null)}
          />
        )}

        {rightPanel === "history" && (
          <HistoryPanel
            snapshots={snapshots}
            currentYaml={yaml}
            ruleCount={ast.length}
            onRestore={handleRestoreSnapshot}
            onSnapshotsChange={setSnapshots}
            onClose={() => setRightPanel(null)}
          />
        )}
      </div>

      {showApiKeyModal && (
        <ApiKeyModal
          currentKey={geminiApiKey}
          onSave={(key) => {
            setGeminiApiKey(key);
            setShowApiKeyModal(false);
          }}
          onClose={() => setShowApiKeyModal(false)}
        />
      )}
    </div>
  );
}
