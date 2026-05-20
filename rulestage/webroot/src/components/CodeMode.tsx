import React, { useState, useCallback, useRef } from "react";
import type { AutomodAST } from "../types";
import { validateYaml } from "../utils/yaml-ast";
import { astToYaml } from "../utils/yaml-ast";

interface CodeModeProps {
  yaml: string;
  ast: AutomodAST;
  onYamlChange: (yaml: string) => void;
}

export default function CodeMode({ yaml, ast, onYamlChange }: CodeModeProps) {
  const [localYaml, setLocalYaml] = useState(yaml);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalYaml(val);
    const result = validateYaml(val);
    setValidation(result);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (result.valid) onYamlChange(val);
    }, 400);
  }, [onYamlChange]);

  React.useEffect(() => {
    setLocalYaml(yaml);
  }, [yaml]);

  const lineCount = localYaml.split("\n").length;

  const SNIPPETS = [
    { label: "Low Karma", yaml: "combined_karma: < 10\naction: remove\n" },
    { label: "New Account", yaml: "account_age: < 7\nreport_reason: New account\n" },
    { label: "Crypto Spam", yaml: 'title: (crypto|bitcoin|nft|web3)\naction: spam\n' },
    { label: "Regex Title", yaml: 'title: "\\b(buy|sell|invest)\\b"\naction: remove\n' },
    { label: "Domain Block", yaml: "domain: bit.ly\naction: remove\n" },
  ];

  return (
    <div className="h-full flex flex-col bg-reddit-dark">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-reddit-darker border-b border-reddit-border shrink-0">
        <span className="text-xs text-reddit-text-muted font-mono">Quick insert:</span>
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            onClick={() => {
              const separator = localYaml.trim() ? "\n---\n" : "";
              const newYaml = localYaml.trimEnd() + separator + s.yaml;
              setLocalYaml(newYaml);
              setValidation({ valid: true });
              onYamlChange(newYaml);
            }}
            className="text-xs px-2 py-1 rounded bg-reddit-card hover:bg-reddit-border border border-reddit-border text-reddit-text-secondary hover:text-reddit-text-primary transition-colors font-mono"
          >
            + {s.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Validation indicator */}
        {validation.valid ? (
          <span className="text-xs flex items-center gap-1 text-reddit-green">
            <span className="w-1.5 h-1.5 rounded-full bg-reddit-green inline-block" />
            Valid YAML
          </span>
        ) : (
          <span className="text-xs flex items-center gap-1 text-reddit-red" title={validation.error}>
            <span className="w-1.5 h-1.5 rounded-full bg-reddit-red inline-block" />
            Invalid YAML
          </span>
        )}

        <span className="text-xs text-reddit-text-muted font-mono">
          {lineCount}L · {ast.length} rule{ast.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div className="select-none bg-reddit-darker border-r border-reddit-border py-4 px-2 text-right min-w-[3rem]">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="text-xs font-mono text-reddit-text-muted leading-[1.6] h-[20.8px]">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <div className="flex-1 relative overflow-auto">
          <textarea
            value={localYaml}
            onChange={handleChange}
            spellCheck={false}
            className="code-editor w-full h-full bg-transparent text-reddit-text-primary p-4 resize-none border-none focus:outline-none"
            style={{
              minHeight: "100%",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
            placeholder="# Write your AutoModerator YAML rules here..."
          />
        </div>

        {/* AST Inspector */}
        <div className="w-72 border-l border-reddit-border bg-reddit-darker overflow-auto p-4 shrink-0">
          <div className="text-xs font-semibold text-reddit-text-muted uppercase tracking-wider mb-3">
            JSON AST
          </div>
          {ast.length === 0 ? (
            <div className="text-xs text-reddit-text-muted italic">No rules parsed yet</div>
          ) : (
            ast.map((rule, idx) => (
              <div key={rule.id} className="mb-3 animate-fade-in">
                <div className="text-xs font-semibold text-reddit-orange mb-1">
                  [{idx}] {rule.name}
                </div>
                <div className="space-y-1">
                  {rule.conditions.map((c) => (
                    <div key={c.id} className="text-xs font-mono">
                      <span className="text-reddit-blue">{c.type}</span>{" "}
                      <span className="text-reddit-yellow">{c.operator}</span>{" "}
                      <span className="text-reddit-green">"{String(c.value)}"</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.actions.map((a) => (
                      <span key={a.id} className="tag-red tag text-[10px]">
                        {a.type}
                        {a.value ? `: ${a.value.slice(0, 12)}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Status bar */}
      {validation.error && (
        <div className="shrink-0 px-4 py-2 bg-reddit-red/10 border-t border-reddit-red/30 text-xs text-reddit-red font-mono">
          ⚠ {validation.error}
        </div>
      )}
    </div>
  );
}
