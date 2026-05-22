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

const CONDITION_TYPES: { value: AutomodConditionType; label: string; color: string }[] = [
  { value: "karma", label: "Karma", color: "#58A6FF" },
  { value: "account_age", label: "Account Age (days)", color: "#58A6FF" },
  { value: "title_regex", label: "Title Pattern", color: "#BC8CFF" },
  { value: "body_regex", label: "Body Pattern", color: "#BC8CFF" },
  { value: "domain", label: "Domain", color: "#D29922" },
  { value: "url_regex", label: "URL Pattern", color: "#D29922" },
  { value: "is_top_level", label: "Is Top Level", color: "#58A6FF" },
];

const ACTION_TYPES: { value: AutomodActionType; label: string; color: string }[] = [
  { value: "remove", label: "Remove Post", color: "#F85149" },
  { value: "spam", label: "Mark as Spam", color: "#F85149" },
  { value: "approve", label: "Approve Post", color: "#3FB950" },
  { value: "report", label: "Report Post", color: "#D29922" },
  { value: "lock", label: "Lock Post", color: "#D29922" },
  { value: "set_flair", label: "Set Flair", color: "#BC8CFF" },
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
      className="p-3 rounded-lg border bg-[#0D1117] mb-2"
      style={{ borderColor: `${typeInfo?.color}40`, borderLeftWidth: 2, borderLeftColor: typeInfo?.color }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold" style={{ color: typeInfo?.color }}>
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
          className="text-xs bg-[#161B22] border border-[#21262D] rounded px-2 py-1 text-[#8B949E] focus:outline-none"
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
            className="text-xs bg-[#161B22] border border-[#21262D] rounded px-2 py-1 text-[#8B949E] focus:outline-none"
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
          className="flex-1 min-w-[80px] text-xs bg-[#161B22] border border-[#21262D] rounded px-2 py-1 text-[#E6EDF3] focus:outline-none focus:border-[#58A6FF] font-mono"
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
      className="p-3 rounded-lg border bg-[#0D1117] mb-2"
      style={{ borderColor: `${typeInfo?.color}40`, borderLeftWidth: 2, borderLeftColor: typeInfo?.color }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold" style={{ color: typeInfo?.color }}>
          {typeInfo?.label}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="text-[#484F58] hover:text-[#F85149] text-xs transition-colors">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as AutomodActionType })}
          className="text-xs bg-[#161B22] border border-[#21262D] rounded px-2 py-1 text-[#8B949E] focus:outline-none"
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
            className="flex-1 min-w-[100px] text-xs bg-[#161B22] border border-[#21262D] rounded px-2 py-1 text-[#E6EDF3] focus:outline-none font-mono"
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
    <div className="bg-[#161B22] border border-[#21262D] rounded-lg p-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-[#484F58] hover:text-[#E6EDF3] disabled:opacity-20 text-xs transition-colors leading-none"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-[#484F58] hover:text-[#E6EDF3] disabled:opacity-20 text-xs transition-colors leading-none"
          >
            ▼
          </button>
        </div>
        <div className="w-6 h-6 rounded bg-[#FF4500]/20 border border-[#FF4500]/40 flex items-center justify-center text-xs font-bold text-[#FF4500]">
          {index + 1}
        </div>
        <input
          value={rule.name}
          onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
          className="flex-1 bg-transparent text-[#E6EDF3] font-semibold text-sm border-b border-transparent hover:border-[#21262D] focus:border-[#58A6FF] focus:outline-none pb-0.5"
        />
        <button
          onClick={onRemove}
          className="text-xs text-[#484F58] hover:text-[#F85149] transition-colors"
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
                className="text-[11px] bg-[#0D1117] border border-[#21262D] rounded px-2 py-0.5 text-[#8B949E]"
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
                className="text-xs text-[#58A6FF] hover:text-[#E6EDF3] transition-colors"
              >
                + Add
              </button>
            </div>
          </div>
          {rule.conditions.length === 0 ? (
            <div className="text-xs text-[#484F58] italic p-2 border border-dashed border-[#21262D] rounded">
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
            <span className="text-[10px] font-semibold text-[#484F58] uppercase tracking-wider">
              THEN
            </span>
            <button
              onClick={() =>
                onUpdate({
                  ...rule,
                  actions: [...rule.actions, { id: genId(), type: "remove" }],
                })
              }
              className="text-xs text-[#58A6FF] hover:text-[#E6EDF3] transition-colors"
            >
              + Add
            </button>
          </div>
          {rule.actions.length === 0 ? (
            <div className="text-xs text-[#484F58] italic p-2 border border-dashed border-[#21262D] rounded">
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
    <div className="h-full flex flex-col overflow-hidden bg-[#0D1117]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#090D13] border-b border-[#21262D] shrink-0">
        <span className="text-xs text-[#484F58]">
          Visual rule builder — changes sync to Code mode instantly
        </span>
        <div className="flex-1" />
        <button
          onClick={addRule}
          data-testid="btn-add-rule"
          className="text-xs bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
        >
          + Add Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {ast.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl opacity-20">⬡</div>
            <div className="text-[#484F58] text-sm">No rules yet</div>
            <button
              onClick={addRule}
              className="text-sm bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-4 py-2 rounded-md transition-colors"
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
            className="w-full py-3 border border-dashed border-[#21262D] rounded-lg text-[#484F58] hover:text-[#8B949E] hover:border-[#484F58] transition-colors text-sm"
          >
            + Add another rule
          </button>
        )}
      </div>
    </div>
  );
}
