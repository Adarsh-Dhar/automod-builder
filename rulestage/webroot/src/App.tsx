import React, { useState, useCallback } from "react";
import type { AppState, AutomodAST, ViewMode, ChatMessage, SimulationDiff } from "./types";
import { yamlToAST, astToYaml } from "./utils/yaml-ast";
import Header from "./components/Header";
import CodeMode from "./components/CodeMode";
import DragMode from "./components/DragMode";
import ChatMode from "./components/ChatMode";
import SimulationPanel from "./components/SimulationPanel";
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

const initialState: AppState = {
  ast: initialAST,
  yaml: DEFAULT_YAML,
  mode: "code",
  chatMessages: [],
  simulationDiff: null,
  isSimulating: false,
  isSyncing: false,
  geminiApiKey: "",
};

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [showSimulation, setShowSimulation] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const updateFromYaml = useCallback((newYaml: string) => {
    const newAst = yamlToAST(newYaml);
    setState((prev) => ({ ...prev, yaml: newYaml, ast: newAst, isSyncing: false }));
  }, []);

  const updateFromAST = useCallback((newAst: AutomodAST) => {
    const newYaml = astToYaml(newAst);
    setState((prev) => ({ ...prev, ast: newAst, yaml: newYaml, isSyncing: false }));
  }, []);

  const setMode = useCallback((mode: ViewMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setState((prev) => ({ ...prev, chatMessages: [...prev.chatMessages, msg] }));
  }, []);

  const applyASTFromChat = useCallback((newAst: AutomodAST) => {
    const newYaml = astToYaml(newAst);
    setState((prev) => ({
      ...prev,
      ast: newAst,
      yaml: newYaml,
    }));
  }, []);

  const setSimulationDiff = useCallback((diff: SimulationDiff | null) => {
    setState((prev) => ({ ...prev, simulationDiff: diff, isSimulating: false }));
  }, []);

  const setIsSimulating = useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, isSimulating: v }));
  }, []);

  const setGeminiApiKey = useCallback((key: string) => {
    setState((prev) => ({ ...prev, geminiApiKey: key }));
  }, []);

  return (
    <div className="min-h-screen bg-reddit-dark flex flex-col">
      <Header
        mode={state.mode}
        setMode={setMode}
        ast={state.ast}
        onRunSimulation={() => setShowSimulation(true)}
        isSimulating={state.isSimulating}
        geminiApiKey={state.geminiApiKey}
        onOpenApiKey={() => setShowApiKeyModal(true)}
      />

      <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 60px)" }}>
        <div className="flex-1 overflow-hidden">
          {state.mode === "code" && (
            <CodeMode
              yaml={state.yaml}
              ast={state.ast}
              onYamlChange={updateFromYaml}
            />
          )}
          {state.mode === "drag" && (
            <DragMode
              ast={state.ast}
              onASTChange={updateFromAST}
            />
          )}
          {state.mode === "chat" && (
            <ChatMode
              ast={state.ast}
              messages={state.chatMessages}
              onAddMessage={addChatMessage}
              onApplyAST={applyASTFromChat}
              geminiApiKey={state.geminiApiKey}
              onOpenApiKey={() => setShowApiKeyModal(true)}
            />
          )}
        </div>

        {showSimulation && (
          <SimulationPanel
            ast={state.ast}
            diff={state.simulationDiff}
            isSimulating={state.isSimulating}
            onRunSimulation={() => {
              setIsSimulating(true);
            }}
            onSimulationComplete={setSimulationDiff}
            onClose={() => setShowSimulation(false)}
          />
        )}
      </div>

      {showApiKeyModal && (
        <ApiKeyModal
          currentKey={state.geminiApiKey}
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
