import type {
  AutomodAST,
  AutomodRule,
  AutomodCondition,
  AutomodAction,
  ExtConditionType,
  ExtActionType,
} from "../types";
import { useCallback, useRef, useState } from "react";

interface DragModeProps {
  ast: AutomodAST;
  onASTChange: (ast: AutomodAST) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Type definitions
interface ConditionDef {
  type: ExtConditionType;
  label: string;
  group: "numeric" | "text" | "enum" | "boolean";
  color: string;
  defaultValue: string;
  defaultOperator?: "<" | "<=" | ">" | ">=" | "==";
  placeholder?: string;
  options?: string[];
}

interface ActionDef {
  type: ExtActionType;
  label: string;
  color: string;
  needsValue?: boolean;
  valueLabel?: string;
  valuePlaceholder?: string;
  options?: string[];
}

type DragPayload =
  | { kind: "rule"; ruleIdx: number }
  | { kind: "condition"; ruleIdx: number; condIdx: number }
  | { kind: "action"; ruleIdx: number; actIdx: number }
  | { kind: "palette-condition"; type: ExtConditionType }
  | { kind: "palette-action"; type: ExtActionType };

// Constants
const COLOR_HEX: Record<string, string> = {
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  emerald: "#10b981",
  teal: "#14b8a6",
  red: "#ef4444",
  slate: "#64748b",
};

const CONDITION_DEFS: ConditionDef[] = [
  // Numeric
  { type: "karma", label: "Post Karma", group: "numeric", color: "sky", defaultValue: "10", defaultOperator: "<" },
  { type: "combined_karma", label: "Combined Karma", group: "numeric", color: "sky", defaultValue: "10", defaultOperator: "<" },
  { type: "account_age", label: "Account Age (days)", group: "numeric", color: "sky", defaultValue: "30", defaultOperator: "<" },
  { type: "num_comments", label: "Comment Count", group: "numeric", color: "sky", defaultValue: "5", defaultOperator: "<" },
  // Text / Regex
  { type: "title_regex", label: "Title Pattern", group: "text", color: "violet", defaultValue: "", placeholder: "(regex)" },
  { type: "body_regex", label: "Body Pattern", group: "text", color: "violet", defaultValue: "", placeholder: "(regex)" },
  { type: "url_regex", label: "URL Pattern", group: "text", color: "violet", defaultValue: "", placeholder: "(regex)" },
  { type: "domain", label: "Domain", group: "text", color: "amber", defaultValue: "", placeholder: "bit.ly" },
  { type: "author_flair", label: "Author Flair", group: "text", color: "amber", defaultValue: "", placeholder: "flair text" },
  { type: "link_flair", label: "Link Flair", group: "text", color: "amber", defaultValue: "", placeholder: "flair text" },
  { type: "crosspost_subreddit", label: "Crosspost From", group: "text", color: "amber", defaultValue: "", placeholder: "subreddit name" },
  // Enum
  { type: "post_type", label: "Post Type", group: "enum", color: "emerald", defaultValue: "link", options: ["link", "self", "image", "video", "gallery", "poll"] },
  // Boolean
  { type: "is_top_level", label: "Is Top Level", group: "boolean", color: "teal", defaultValue: "true", options: ["true", "false"] },
];

const ACTION_DEFS: ActionDef[] = [
  { type: "remove", label: "Remove", color: "red" },
  { type: "spam", label: "Mark as Spam", color: "red" },
  { type: "approve", label: "Approve", color: "emerald" },
  { type: "report", label: "Report", color: "amber", needsValue: true, valueLabel: "Reason", valuePlaceholder: "Reason..." },
  { type: "add_moderator_report", label: "Mod Report", color: "amber", needsValue: true, valueLabel: "Reason", valuePlaceholder: "Reason..." },
  { type: "lock", label: "Lock", color: "amber" },
  { type: "set_flair", label: "Set Link Flair", color: "violet", needsValue: true, valueLabel: "Flair text", valuePlaceholder: "Flair text..." },
  { type: "reply", label: "Reply (comment)", color: "violet", needsValue: true, valueLabel: "Reply body", valuePlaceholder: "Comment body..." },
  { type: "set_suggested_sort", label: "Set Sort", color: "violet", needsValue: true, valueLabel: "Sort order", valuePlaceholder: "top, new, etc." },
  { type: "ignore_reports", label: "Ignore Reports", color: "slate" },
  { type: "stickied", label: "Stickied", color: "slate" },
];

const COND_GROUPS: { label: string; types: ExtConditionType[] }[] = [
  { label: "Numeric", types: ["karma", "combined_karma", "account_age", "num_comments"] },
  { label: "Text", types: ["title_regex", "body_regex", "url_regex", "domain", "author_flair", "link_flair", "crosspost_subreddit"] },
  { label: "Enum", types: ["post_type"] },
  { label: "Boolean", types: ["is_top_level"] },
];

const ACT_GROUPS: { label: string; types: ExtActionType[] }[] = [
  { label: "Moderation", types: ["remove", "spam", "approve", "report", "add_moderator_report"] },
  { label: "Post state", types: ["lock", "ignore_reports", "stickied"] },
  { label: "Metadata", types: ["set_flair", "set_suggested_sort"] },
  { label: "Messaging", types: ["reply"] },
];

// Helper functions
function makeCondition(type: ExtConditionType): AutomodCondition {
  const def = CONDITION_DEFS.find((d) => d.type === type);
  if (!def) throw new Error(`Unknown condition type: ${type}`);
  return {
    id: genId(),
    type,
    operator: def.defaultOperator || "<",
    value: def.defaultValue,
  };
}

function makeAction(type: ExtActionType): AutomodAction {
  return {
    id: genId(),
    type,
  };
}

function ruleToYaml(rule: AutomodRule): string {
  let yaml = `# ${rule.name}\n`;
  
  if (rule.conditions.length === 0) {
    yaml += `# Applies to all posts\n`;
  } else {
    rule.conditions.forEach((cond) => {
      const def = CONDITION_DEFS.find((d) => d.type === cond.type);
      if (!def) return;
      
      if (def.group === "numeric") {
        yaml += `${cond.type}:\n`;
        yaml += `    ${cond.operator} "${cond.value}"\n`;
      } else if (def.group === "enum" || def.group === "boolean") {
        yaml += `${cond.type}:\n`;
        yaml += `    - "${cond.value}"\n`;
      } else {
        yaml += `${cond.type}:\n`;
        yaml += `    - "${cond.value}"\n`;
      }
    });
    
    if (rule.conditions.length > 1) {
      yaml += `moderator_action_match: ${rule.conditionCombination}\n`;
    }
  }
  
  rule.actions.forEach((action) => {
    const def = ACTION_DEFS.find((d) => d.type === action.type);
    if (!def) return;
    
    if (action.type === "remove") {
      yaml += `action: remove\n`;
    } else if (action.type === "spam") {
      yaml += `action: spam\n`;
    } else if (action.type === "approve") {
      yaml += `action: approve\n`;
    } else if (action.type === "lock") {
      yaml += `action: lock\n`;
    } else if (action.type === "report" && action.value) {
      yaml += `action: report\n`;
      yaml += `action_reason: "${action.value}"\n`;
    } else if (action.type === "add_moderator_report" && action.value) {
      yaml += `action: modmail\n`;
      yaml += `action_reason: "${action.value}"\n`;
    } else if (action.type === "set_flair" && action.value) {
      yaml += `action: flair\n`;
      yaml += `flair_text: "${action.value}"\n`;
    } else if (action.type === "reply" && action.value) {
      yaml += `action: comment\n`;
      yaml += `comment: "${action.value}"\n`;
    } else if (action.type === "set_suggested_sort" && action.value) {
      yaml += `set_suggested_sort: "${action.value}"\n`;
    } else if (action.type === "ignore_reports") {
      yaml += `ignore_reports: true\n`;
    } else if (action.type === "stickied") {
      yaml += `stickied: true\n`;
    }
  });
  
  return yaml;
}

function ConditionChip({
  condition,
  ruleIdx,
  condIdx,
  onUpdate,
  onRemove,
}: {
  condition: AutomodCondition;
  ruleIdx: number;
  condIdx: number;
  onUpdate: (c: AutomodCondition) => void;
  onRemove: () => void;
}) {
  const def = CONDITION_DEFS.find((d) => d.type === condition.type);
  const payloadRef = useRef<DragPayload>({ kind: "condition", ruleIdx, condIdx });

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payloadRef.current));
  };

  if (!def) return null;

  const isNumeric = def.group === "numeric";
  const isEnum = def.group === "enum";
  const isBool = def.group === "boolean";

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-3 rounded-lg border bg-slate-950 mb-2 border-white/10 border-l-2 cursor-grab active:cursor-grabbing group"
      style={{ borderLeftColor: COLOR_HEX[def.color] }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-500 text-xs">⠿</span>
        <span className="text-xs font-semibold" style={{ color: COLOR_HEX[def.color] }}>
          {def.label}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="text-slate-500 hover:text-red-500 text-xs transition-colors opacity-0 group-hover:opacity-100">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={condition.type}
          onChange={(e) => onUpdate({ ...condition, type: e.target.value as ExtConditionType })}
          className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
        >
          {CONDITION_DEFS.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
        {isNumeric && (
          <select
            value={condition.operator}
            onChange={(e) =>
              onUpdate({ ...condition, operator: e.target.value as AutomodCondition["operator"] })
            }
            className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
          >
            {["<", "<=", ">", ">=", "=="].map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        )}
        {(isEnum || isBool) && def.options ? (
          <select
            value={condition.value}
            onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
            className="flex-1 min-w-20 text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
          >
            {def.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={isNumeric ? "number" : "text"}
            value={String(condition.value)}
            onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
            placeholder={def.placeholder}
            className="flex-1 min-w-20 text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
          />
        )}
      </div>
    </div>
  );
}

function ActionChip({
  action,
  ruleIdx,
  actIdx,
  onUpdate,
  onRemove,
}: {
  action: AutomodAction;
  ruleIdx: number;
  actIdx: number;
  onUpdate: (a: AutomodAction) => void;
  onRemove: () => void;
}) {
  const def = ACTION_DEFS.find((d) => d.type === action.type);
  const payloadRef = useRef<DragPayload>({ kind: "action", ruleIdx, actIdx });

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payloadRef.current));
  };

  if (!def) return null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-3 rounded-lg border bg-slate-950 mb-2 border-white/10 border-l-2 cursor-grab active:cursor-grabbing group"
      style={{ borderLeftColor: COLOR_HEX[def.color] }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-500 text-xs">⠿</span>
        <span className="text-xs font-semibold" style={{ color: COLOR_HEX[def.color] }}>
          {def.label}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="text-slate-500 hover:text-red-500 text-xs transition-colors opacity-0 group-hover:opacity-100">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as ExtActionType })}
          className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
        >
          {ACTION_DEFS.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
        {def.needsValue && (
          <input
            type="text"
            value={action.value || ""}
            onChange={(e) => onUpdate({ ...action, value: e.target.value })}
            placeholder={def.valuePlaceholder}
            className="flex-1 min-w-25 text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-100 focus:outline-none font-mono"
          />
        )}
      </div>
    </div>
  );
}

function DropZone({
  label,
  onDrop,
  target,
}: {
  label: string;
  onDrop: (payload: DragPayload, target: "condition" | "action") => void;
  target: "condition" | "action";
}) {
  const [over, setOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(true);
  };

  const handleDragLeave = () => {
    setOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    try {
      const payload = JSON.parse(data) as DragPayload;
      onDrop(payload, target);
    } catch {
      // Invalid JSON, ignore
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-3 border border-dashed rounded-lg text-center text-xs transition-colors ${
        over ? "border-sky-500 bg-sky-500/10 text-sky-400" : "border-white/10 text-slate-500"
      }`}
    >
      {over ? "Drop here" : label}
    </div>
  );
}

function PaletteSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-8 border-r border-white/10 bg-slate-900 flex flex-col items-center py-2">
        <button
          onClick={() => setCollapsed(false)}
          className="text-slate-500 hover:text-slate-100 text-xs transition-colors"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-white/10 bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold text-slate-400">Palette</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-slate-500 hover:text-slate-100 text-xs transition-colors"
        >
          ◀
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Conditions */}
        <div>
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Conditions
          </h3>
          {COND_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="text-[10px] text-slate-600 mb-1">{group.label}</div>
              {group.types.map((type) => {
                const def = CONDITION_DEFS.find((d) => d.type === type);
                if (!def) return null;
                const payload: DragPayload = { kind: "palette-condition", type };
                return (
                  <div
                    key={type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify(payload));
                    }}
                    className="p-2 rounded bg-slate-950 border border-white/10 border-l-2 mb-1 cursor-grab active:cursor-grabbing text-xs"
                    style={{ borderLeftColor: COLOR_HEX[def.color] }}
                  >
                    {def.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Actions */}
        <div>
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Actions
          </h3>
          {ACT_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="text-[10px] text-slate-600 mb-1">{group.label}</div>
              {group.types.map((type) => {
                const def = ACTION_DEFS.find((d) => d.type === type);
                if (!def) return null;
                const payload: DragPayload = { kind: "palette-action", type };
                return (
                  <div
                    key={type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify(payload));
                    }}
                    className="p-2 rounded bg-slate-950 border border-white/10 border-l-2 mb-1 cursor-grab active:cursor-grabbing text-xs"
                    style={{ borderLeftColor: COLOR_HEX[def.color] }}
                  >
                    {def.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDrop,
}: {
  rule: AutomodRule;
  index: number;
  total: number;
  onUpdate: (r: AutomodRule) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDrop: (payload: DragPayload, target: "condition" | "action") => void;
}) {
  const [showYaml, setShowYaml] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const payloadRef = useRef<DragPayload>({ kind: "rule", ruleIdx: index });

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify(payloadRef.current));
  };

  const handleChipDrop = (payload: DragPayload, target: "condition" | "action") => {
    onDrop(payload, target);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`bg-slate-900 border border-white/10 rounded-lg p-4 mb-4 transition-opacity ${!enabled ? "opacity-40" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">⠿</span>
          <div className="w-6 h-6 rounded bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xs font-bold text-orange-500">
            {index + 1}
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-slate-500 hover:text-slate-100 disabled:opacity-20 text-xs transition-colors leading-none"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="text-slate-500 hover:text-slate-100 disabled:opacity-20 text-xs transition-colors leading-none"
            >
              ▼
            </button>
          </div>
        </div>
        <input
          value={rule.name}
          onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
          className="flex-1 bg-transparent text-slate-100 font-semibold text-sm border-b border-transparent hover:border-white/10 focus:border-sky-500 focus:outline-none pb-0.5"
        />
        <button
          onClick={() => setEnabled(!enabled)}
          className={`text-xs px-2 py-1 rounded transition-colors ${enabled ? "bg-emerald-500/20 text-emerald-500" : "bg-slate-700 text-slate-400"}`}
        >
          {enabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setShowYaml(!showYaml)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          yaml ↓
        </button>
        <button
          onClick={onRemove}
          className="text-xs text-slate-500 hover:text-red-500 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Match row */}
      <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
        <span>Match when</span>
        <select
          value={rule.conditionCombination}
          onChange={(e) =>
            onUpdate({ ...rule, conditionCombination: e.target.value as "all" | "any" })
          }
          className="bg-slate-950 border border-white/10 rounded px-2 py-0.5 text-slate-400"
        >
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span>of these conditions are true:</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Conditions
            </span>
            <button
              onClick={() =>
                onUpdate({
                  ...rule,
                  conditions: [...rule.conditions, makeCondition("karma")],
                })
              }
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              + add condition
            </button>
          </div>
          <DropZone
            label="Drop condition here"
            onDrop={handleChipDrop}
            target="condition"
          />
          {rule.conditions.map((c, ci) => (
            <ConditionChip
              key={c.id}
              condition={c}
              ruleIdx={index}
              condIdx={ci}
              onUpdate={(updated) => {
                const conditions = [...rule.conditions];
                conditions[ci] = updated;
                onUpdate({ ...rule, conditions });
              }}
              onRemove={() =>
                onUpdate({ ...rule, conditions: rule.conditions.filter((_, i) => i !== ci) })
              }
            />
          ))}
          <DropZone
            label="+"
            onDrop={handleChipDrop}
            target="condition"
          />
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Actions
            </span>
            <button
              onClick={() =>
                onUpdate({
                  ...rule,
                  actions: [...rule.actions, makeAction("remove")],
                })
              }
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              + add action
            </button>
          </div>
          <DropZone
            label="Drop action here"
            onDrop={handleChipDrop}
            target="action"
          />
          {rule.actions.map((a, ai) => (
            <ActionChip
              key={a.id}
              action={a}
              ruleIdx={index}
              actIdx={ai}
              onUpdate={(updated) => {
                const actions = [...rule.actions];
                actions[ai] = updated;
                onUpdate({ ...rule, actions });
              }}
              onRemove={() =>
                onUpdate({ ...rule, actions: rule.actions.filter((_, i) => i !== ai) })
              }
            />
          ))}
          <DropZone
            label="+"
            onDrop={handleChipDrop}
            target="action"
          />
        </div>
      </div>

      {/* YAML Preview */}
      {showYaml && (
        <div className="mt-4 p-3 bg-slate-950 rounded border border-white/10">
          <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
            {ruleToYaml(rule)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function DragMode({ ast, onASTChange }: DragModeProps) {
  const [dragOverRuleIdx, setDragOverRuleIdx] = useState<number | null>(null);

  const addRule = () => {
    const newRule: AutomodRule = {
      id: genId(),
      name: `Rule ${ast.length + 1}`,
      conditions: [],
      conditionCombination: "all",
      actions: [],
    };
    onASTChange([...ast, newRule]);
  };

  const updateRule = useCallback((idx: number, updated: AutomodRule) => {
    const next = [...ast];
    next[idx] = updated;
    onASTChange(next);
  }, [ast, onASTChange]);

  const removeRule = (idx: number) => onASTChange(ast.filter((_, i) => i !== idx));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...ast];
    [next[idx - 1]!, next[idx]!] = [next[idx]!, next[idx - 1]!];
    onASTChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx === ast.length - 1) return;
    const next = [...ast];
    [next[idx]!, next[idx + 1]!] = [next[idx + 1]!, next[idx]!];
    onASTChange(next);
  };

  const handleDrop = useCallback((payload: DragPayload, target: "condition" | "action", targetRuleIdx: number) => {
    if (payload.kind === "palette-condition") {
      const newCondition = makeCondition(payload.type);
      const targetRule = ast[targetRuleIdx];
      if (!targetRule) return;
      updateRule(targetRuleIdx, {
        ...targetRule,
        conditions: [...targetRule.conditions, newCondition],
      });
    } else if (payload.kind === "palette-action") {
      const newAction = makeAction(payload.type);
      const targetRule = ast[targetRuleIdx];
      if (!targetRule) return;
      updateRule(targetRuleIdx, {
        ...targetRule,
        actions: [...targetRule.actions, newAction],
      });
    } else if (payload.kind === "condition" && target === "condition") {
      if (payload.ruleIdx === targetRuleIdx) return;
      const sourceRule = ast[payload.ruleIdx];
      const targetRule = ast[targetRuleIdx];
      if (!sourceRule || !targetRule) return;
      const condition = sourceRule.conditions[payload.condIdx];
      if (!condition) return;
      const updatedSourceRule: AutomodRule = {
        ...sourceRule,
        conditions: sourceRule.conditions.filter((_, i) => i !== payload.condIdx),
      };
      const updatedTargetRule: AutomodRule = {
        ...targetRule,
        conditions: [...targetRule.conditions, condition],
      };
      const next = [...ast];
      next[payload.ruleIdx] = updatedSourceRule;
      next[targetRuleIdx] = updatedTargetRule;
      onASTChange(next);
    } else if (payload.kind === "action" && target === "action") {
      if (payload.ruleIdx === targetRuleIdx) return;
      const sourceRule = ast[payload.ruleIdx];
      const targetRule = ast[targetRuleIdx];
      if (!sourceRule || !targetRule) return;
      const action = sourceRule.actions[payload.actIdx];
      if (!action) return;
      const updatedSourceRule: AutomodRule = {
        ...sourceRule,
        actions: sourceRule.actions.filter((_, i) => i !== payload.actIdx),
      };
      const updatedTargetRule: AutomodRule = {
        ...targetRule,
        actions: [...targetRule.actions, action],
      };
      const next = [...ast];
      next[payload.ruleIdx] = updatedSourceRule;
      next[targetRuleIdx] = updatedTargetRule;
      onASTChange(next);
    }
  }, [ast, onASTChange, updateRule]);

  const handleRuleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverRuleIdx(idx);
  };

  const handleRuleDragLeave = () => {
    setDragOverRuleIdx(null);
  };

  const handleRuleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverRuleIdx(null);
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    try {
      const payload = JSON.parse(data) as DragPayload;
      if (payload.kind === "rule" && dragOverRuleIdx !== null && dragOverRuleIdx !== payload.ruleIdx) {
        const next = [...ast];
        const [removed] = next.splice(payload.ruleIdx, 1);
        if (removed) {
          next.splice(dragOverRuleIdx, 0, removed);
          onASTChange(next);
        }
      }
    } catch {
      // Invalid JSON, ignore
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-950/95 border-b border-white/10 shrink-0">
        <span className="text-xs text-slate-500">
          Visual rule builder — changes sync to Code mode instantly
        </span>
        <div className="flex-1" />
        <button
          onClick={addRule}
          data-testid="btn-add-rule"
          className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
        >
          + New Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto flex">
        <PaletteSidebar />
        <div className="flex-1 overflow-auto p-4">
          {ast.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-sm text-slate-400 mb-2">No rules yet</div>
              <div className="text-xs text-slate-500 mb-4">Drag conditions and actions from the palette to build your first rule</div>
              <button
                onClick={addRule}
                className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
              >
                + New Rule
              </button>
            </div>
          ) : (
            ast.map((rule, idx) => (
              <div
                key={rule.id}
                onDragOver={(e) => handleRuleDragOver(e, idx)}
                onDragLeave={handleRuleDragLeave}
                onDrop={handleRuleDrop}
                className={dragOverRuleIdx === idx ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-slate-950 rounded-lg" : ""}
              >
                <RuleCard
                  rule={rule}
                  index={idx}
                  total={ast.length}
                  onUpdate={(updated) => updateRule(idx, updated)}
                  onRemove={() => removeRule(idx)}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                  onDrop={(payload, target) => handleDrop(payload, target, idx)}
                />
              </div>
            ))
          )}
          {ast.length > 0 && (
            <button
              onClick={addRule}
              className="w-full py-3 border border-dashed border-white/10 rounded-lg text-slate-500 hover:text-slate-400 hover:border-slate-500 transition-colors text-sm"
            >
              + New Rule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
