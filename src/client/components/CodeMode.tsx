import { useState, useCallback, useRef, useEffect } from "react";
import type { AutomodAST } from "../types";
import { validateYaml } from "../utils/yaml-ast";

interface CodeModeProps {
  yaml: string;
  ast: AutomodAST;
  onYamlChange: (yaml: string) => void;
}

const SNIPPETS = [
  { label: "Low Karma", code: "combined_karma: < 10\naction: remove\n" },
  { label: "New Account", code: "account_age: < 7\nreport_reason: New account\n" },
  { label: "Crypto Spam", code: "title: (crypto|bitcoin|nft|web3)\naction: spam\n" },
  { label: "Domain Block", code: "domain: bit.ly\naction: remove\n" },
  { label: "URL Pattern", code: "url: (bit\\.ly|tinyurl)\naction: remove\n" },
];

export default function CodeMode({ yaml, ast, onYamlChange }: CodeModeProps) {
  const [localYaml, setLocalYaml] = useState(yaml);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalYaml(yaml);
  }, [yaml]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalYaml(val);
      const result = validateYaml(val);
      setValidation(result);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (result.valid) onYamlChange(val);
      }, 400);
    },
    [onYamlChange]
  );

  const insertSnippet = (code: string) => {
    const sep = localYaml.trim() ? "\n---\n" : "";
    const next = localYaml.trimEnd() + sep + code;
    setLocalYaml(next);
    setValidation({ valid: true });
    onYamlChange(next);
  };

  const lineCount = localYaml.split("\n").length;

  return (
    <div className="h-full flex flex-col bg-[#0D1117]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#090D13] border-b border-[#21262D] shrink-0 overflow-x-auto">
        <span className="text-xs text-[#484F58] font-mono shrink-0">insert:</span>
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            onClick={() => insertSnippet(s.code)}
            className="text-xs px-2 py-1 rounded bg-[#161B22] hover:bg-[#21262D] border border-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors font-mono shrink-0"
          >
            + {s.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-3 shrink-0">
          {validation.valid ? (
            <span className="text-xs flex items-center gap-1 text-[#3FB950]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
              Valid
            </span>
          ) : (
            <span className="text-xs flex items-center gap-1 text-[#F85149]" title={validation.error}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#F85149]" />
              Invalid
            </span>
          )}
          <span className="text-xs text-[#484F58] font-mono">
            {lineCount}L · {ast.length}R
          </span>
        </div>
      </div>

      {/* Editor + Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div className="select-none bg-[#090D13] border-r border-[#21262D] py-4 px-2 text-right w-10 sm:w-12 overflow-hidden">
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i + 1}
              className="text-[11px] font-mono text-[#484F58] leading-[1.6] h-[20.8px]"
            >
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
            data-testid="code-editor"
            className="w-full h-full bg-transparent text-[#E6EDF3] p-4 resize-none border-none focus:outline-none font-mono text-[13px] leading-[1.6]"
            style={{ minHeight: "100%", caretColor: "#FF4500" }}
            placeholder="# Write your AutoModerator YAML rules here..."
          />
        </div>

        {/* AST Inspector */}
        <div className="w-48 md:w-64 border-l border-[#21262D] bg-[#090D13] overflow-auto p-3 shrink-0 hidden sm:block">
          <div className="text-[10px] font-semibold text-[#484F58] uppercase tracking-wider mb-3">
            JSON AST
          </div>
          {ast.length === 0 ? (
            <div className="text-xs text-[#484F58] italic">No rules parsed</div>
          ) : (
            ast.map((rule, idx) => (
              <div key={rule.id} className="mb-3">
                <div className="text-xs font-semibold text-[#FF4500] mb-1 truncate">
                  [{idx}] {rule.name}
                </div>
                {rule.conditions.map((c) => (
                  <div key={c.id} className="text-[11px] font-mono mb-0.5">
                    <span className="text-[#58A6FF]">{c.type}</span>{" "}
                    <span className="text-[#D29922]">{c.operator}</span>{" "}
                    <span className="text-[#3FB950]">"{String(c.value)}"</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1 mt-1">
                  {rule.actions.map((a) => (
                    <span
                      key={a.id}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[#F85149]/10 text-[#F85149] border-[#F85149]/30"
                    >
                      {a.type}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {validation.error && (
        <div className="shrink-0 px-4 py-2 bg-[#F85149]/10 border-t border-[#F85149]/30 text-xs text-[#F85149] font-mono truncate">
          ⚠ {validation.error}
        </div>
      )}
    </div>
  );
}
