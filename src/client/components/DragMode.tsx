import type {
  AutomodAST,
  AutomodRule,
  AutomodCondition,
  AutomodAction,
  AutomodConditionType,
  AutomodActionType,
} from "../types";

interface DragModeProps {
  ast: AutomodAST;
  onASTChange: (ast: AutomodAST) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const CONDITION_TYPES: { value: AutomodConditionType; label: string; colorClass: string }[] = [
  { value: "karma", label: "Karma", colorClass: "text-sky-500" },
  { value: "account_age", label: "Account Age (days)", colorClass: "text-sky-500" },
  { value: "title_regex", label: "Title Pattern", colorClass: "text-violet-500" },
  { value: "body_regex", label: "Body Pattern", colorClass: "text-violet-500" },
  { value: "domain", label: "Domain", colorClass: "text-amber-500" },
  { value: "url_regex", label: "URL Pattern", colorClass: "text-amber-500" },
  { value: "is_top_level", label: "Is Top Level", colorClass: "text-sky-500" },
];

const ACTION_TYPES: { value: AutomodActionType; label: string; colorClass: string }[] = [
  { value: "remove", label: "Remove Post", colorClass: "text-red-500" },
  { value: "spam", label: "Mark as Spam", colorClass: "text-red-500" },
  { value: "approve", label: "Approve Post", colorClass: "text-emerald-500" },
  { value: "report", label: "Report Post", colorClass: "text-amber-500" },
  { value: "lock", label: "Lock Post", colorClass: "text-amber-500" },
  { value: "set_flair", label: "Set Flair", colorClass: "text-violet-500" },
];

function ConditionBlock({
  condition,
  onUpdate,
  onRemove,
}: {
  condition: AutomodCondition;
  onUpdate: (c: AutomodCondition) => void;
  onRemove: () => void;
}) {
  const typeInfo = CONDITION_TYPES.find((t) => t.value === condition.type);
  return (
    <div
      className="p-3 rounded-lg border bg-slate-950 mb-2 border-white/10 border-l-2"
      style={{ borderLeftColor: typeInfo?.colorClass.replace('text-', '') === 'sky-500' ? '#0ea5e9' : typeInfo?.colorClass.replace('text-', '') === 'violet-500' ? '#8b5cf6' : typeInfo?.colorClass.replace('text-', '') === 'amber-500' ? '#f59e0b' : '' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold ${typeInfo?.colorClass}`}>
          {typeInfo?.label}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="text-[#484F58] hover:text-[#F85149] text-xs transition-colors">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={condition.type}
          onChange={(e) => onUpdate({ ...condition, type: e.target.value as AutomodConditionType })}
          className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
        >
          {CONDITION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {["karma", "account_age"].includes(condition.type) && (
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
        <input
          type={["karma", "account_age"].includes(condition.type) ? "number" : "text"}
          value={String(condition.value)}
          onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
          placeholder={
            condition.type === "karma"
              ? "100"
              : condition.type === "account_age"
              ? "30"
              : condition.type === "domain"
              ? "bit.ly"
              : "(regex)"
          }
          className="flex-1 min-w-20 text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
        />
      </div>
    </div>
  );
}

function ActionBlock({
  action,
  onUpdate,
  onRemove,
}: {
  action: AutomodAction;
  onUpdate: (a: AutomodAction) => void;
  onRemove: () => void;
}) {
  const typeInfo = ACTION_TYPES.find((t) => t.value === action.type);
  return (
    <div
      className="p-3 rounded-lg border bg-slate-950 mb-2 border-white/10 border-l-2"
      style={{ borderLeftColor: typeInfo?.colorClass.replace('text-', '') === 'red-500' ? '#ef4444' : typeInfo?.colorClass.replace('text-', '') === 'emerald-500' ? '#10b981' : typeInfo?.colorClass.replace('text-', '') === 'amber-500' ? '#f59e0b' : typeInfo?.colorClass.replace('text-', '') === 'violet-500' ? '#8b5cf6' : '' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold ${typeInfo?.colorClass}`}>
          {typeInfo?.label}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="text-slate-500 hover:text-red-500 text-xs transition-colors">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as AutomodActionType })}
          className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-400 focus:outline-none"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {["report", "set_flair"].includes(action.type) && (
          <input
            type="text"
            value={action.value || ""}
            onChange={(e) => onUpdate({ ...action, value: e.target.value })}
            placeholder={action.type === "report" ? "Reason..." : "Flair text..."}
            className="flex-1 min-w-25 text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-100 focus:outline-none font-mono"
          />
        )}
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
}: {
  rule: AutomodRule;
  index: number;
  total: number;
  onUpdate: (r: AutomodRule) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="bg-slate-900 border border-white/10 rounded-lg p-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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
        <div className="w-6 h-6 rounded bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xs font-bold text-orange-500">
          {index + 1}
        </div>
        <input
          value={rule.name}
          onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
          className="flex-1 bg-transparent text-slate-100 font-semibold text-sm border-b border-transparent hover:border-white/10 focus:border-sky-500 focus:outline-none pb-0.5"
        />
        <button
          onClick={onRemove}
          className="text-xs text-slate-500 hover:text-red-500 transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-[#484F58] uppercase tracking-wider">
              IF
            </span>
            <div className="flex items-center gap-3">
              <select
                value={rule.conditionCombination}
                onChange={(e) =>
                  onUpdate({ ...rule, conditionCombination: e.target.value as "all" | "any" })
                }
                className="text-[11px] bg-slate-950 border border-white/10 rounded px-2 py-0.5 text-slate-400"
              >
                <option value="all">ALL match</option>
                <option value="any">ANY match</option>
              </select>
              <button
                onClick={() =>
                  onUpdate({
                    ...rule,
                    conditions: [
                      ...rule.conditions,
                      { id: genId(), type: "karma", operator: "<", value: "10" },
                    ],
                  })
                }
                className="text-xs text-sky-500 hover:text-slate-100 transition-colors"
              >
                + Add
              </button>
            </div>
          </div>
          {rule.conditions.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-2 border border-dashed border-white/10 rounded">
              No conditions — applies to all posts
            </div>
          ) : (
            rule.conditions.map((c, ci) => (
              <ConditionBlock
                key={c.id}
                condition={c}
                onUpdate={(updated) => {
                  const conditions = [...rule.conditions];
                  conditions[ci] = updated;
                  onUpdate({ ...rule, conditions });
                }}
                onRemove={() =>
                  onUpdate({ ...rule, conditions: rule.conditions.filter((_, i) => i !== ci) })
                }
              />
            ))
          )}
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              THEN
            </span>
            <button
              onClick={() =>
                onUpdate({
                  ...rule,
                  actions: [...rule.actions, { id: genId(), type: "remove" }],
                })
              }
              className="text-xs text-sky-500 hover:text-slate-100 transition-colors"
            >
              + Add
            </button>
          </div>
          {rule.actions.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-2 border border-dashed border-white/10 rounded">
              No actions defined
            </div>
          ) : (
            rule.actions.map((a, ai) => (
              <ActionBlock
                key={a.id}
                action={a}
                onUpdate={(updated) => {
                  const actions = [...rule.actions];
                  actions[ai] = updated;
                  onUpdate({ ...rule, actions });
                }}
                onRemove={() =>
                  onUpdate({ ...rule, actions: rule.actions.filter((_, i) => i !== ai) })
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function DragMode({ ast, onASTChange }: DragModeProps) {
  const addRule = () => {
    const newRule: AutomodRule = {
      id: genId(),
      name: `Rule ${ast.length + 1}`,
      conditions: [{ id: genId(), type: "karma", operator: "<", value: "10" }],
      conditionCombination: "all",
      actions: [{ id: genId(), type: "remove" }],
    };
    onASTChange([...ast, newRule]);
  };

  const updateRule = (idx: number, updated: AutomodRule) => {
    const next = [...ast];
    next[idx] = updated;
    onASTChange(next);
  };

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
          + Add Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {ast.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl opacity-20">⬡</div>
            <div className="text-slate-500 text-sm">No rules yet</div>
            <button
              onClick={addRule}
              className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-md transition-colors"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          ast.map((rule, idx) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              index={idx}
              total={ast.length}
              onUpdate={(updated) => updateRule(idx, updated)}
              onRemove={() => removeRule(idx)}
              onMoveUp={() => moveUp(idx)}
              onMoveDown={() => moveDown(idx)}
            />
          ))
        )}
        {ast.length > 0 && (
          <button
            onClick={addRule}
            className="w-full py-3 border border-dashed border-white/10 rounded-lg text-slate-500 hover:text-slate-400 hover:border-slate-500 transition-colors text-sm"
          >
            + Add another rule
          </button>
        )}
      </div>
    </div>
  );
}
