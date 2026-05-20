import React, { useState } from "react";
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

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const CONDITION_TYPES: { value: AutomodConditionType; label: string; color: string }[] = [
  { value: "karma", label: "Karma", color: "blue" },
  { value: "account_age", label: "Account Age", color: "blue" },
  { value: "title_regex", label: "Title Pattern", color: "purple" },
  { value: "body_regex", label: "Body Pattern", color: "purple" },
  { value: "domain", label: "Domain", color: "yellow" },
  { value: "url_regex", label: "URL Pattern", color: "yellow" },
  { value: "is_top_level", label: "Is Top Level", color: "blue" },
];

const ACTION_TYPES: { value: AutomodActionType; label: string; color: string }[] = [
  { value: "remove", label: "Remove Post", color: "red" },
  { value: "spam", label: "Mark as Spam", color: "red" },
  { value: "approve", label: "Approve Post", color: "green" },
  { value: "report", label: "Report Post", color: "yellow" },
  { value: "lock", label: "Lock Post", color: "yellow" },
  { value: "set_flair", label: "Set Flair", color: "purple" },
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
  const color = typeInfo?.color || "blue";

  return (
    <div className={`card p-3 border-l-2 border-l-reddit-${color} animate-slide-in`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full bg-reddit-${color}`} />
        <span className="text-xs font-semibold text-reddit-text-primary">{typeInfo?.label}</span>
        <div className="flex-1" />
        <button
          onClick={onRemove}
          className="text-reddit-text-muted hover:text-reddit-red transition-colors text-xs"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={condition.type}
          onChange={(e) => onUpdate({ ...condition, type: e.target.value as AutomodConditionType })}
          className="text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-1 text-reddit-text-secondary focus:outline-none focus:border-reddit-blue"
        >
          {CONDITION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {["karma", "account_age"].includes(condition.type) && (
          <select
            value={condition.operator}
            onChange={(e) => onUpdate({ ...condition, operator: e.target.value as AutomodCondition["operator"] })}
            className="text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-1 text-reddit-text-secondary focus:outline-none"
          >
            {["<", "<=", ">", ">=", "=="].map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        )}
        <input
          type={["karma", "account_age"].includes(condition.type) ? "number" : "text"}
          value={String(condition.value)}
          onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
          placeholder={
            condition.type === "karma" ? "100" :
            condition.type === "account_age" ? "30" :
            condition.type === "domain" ? "bit.ly" :
            "(regex|pattern)"
          }
          className="flex-1 text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-1 text-reddit-text-primary focus:outline-none focus:border-reddit-blue font-mono"
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
  const color = typeInfo?.color || "red";

  return (
    <div className={`card p-3 border-l-2 border-l-reddit-${color} animate-slide-in`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full bg-reddit-${color}`} />
        <span className="text-xs font-semibold text-reddit-text-primary">{typeInfo?.label}</span>
        <div className="flex-1" />
        <button
          onClick={onRemove}
          className="text-reddit-text-muted hover:text-reddit-red transition-colors text-xs"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as AutomodActionType })}
          className="text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-1 text-reddit-text-secondary focus:outline-none"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {["report", "set_flair"].includes(action.type) && (
          <input
            type="text"
            value={action.value || ""}
            onChange={(e) => onUpdate({ ...action, value: e.target.value })}
            placeholder={action.type === "report" ? "Reason for report" : "Flair text"}
            className="flex-1 text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-1 text-reddit-text-primary focus:outline-none font-mono"
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
  const addCondition = () => {
    onUpdate({
      ...rule,
      conditions: [
        ...rule.conditions,
        { id: generateId(), type: "karma", operator: "<", value: "10" },
      ],
    });
  };

  const addAction = () => {
    onUpdate({
      ...rule,
      actions: [
        ...rule.actions,
        { id: generateId(), type: "remove" },
      ],
    });
  };

  return (
    <div className="card p-4 mb-4 animate-fade-in">
      {/* Rule header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-reddit-text-muted hover:text-reddit-text-primary disabled:opacity-20 transition-colors text-xs leading-none"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-reddit-text-muted hover:text-reddit-text-primary disabled:opacity-20 transition-colors text-xs leading-none"
          >
            ▼
          </button>
        </div>

        <div className="w-6 h-6 rounded bg-reddit-orange/20 border border-reddit-orange/40 flex items-center justify-center text-xs font-bold text-reddit-orange">
          {index + 1}
        </div>

        <input
          value={rule.name}
          onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
          className="flex-1 bg-transparent text-reddit-text-primary font-semibold text-sm border-b border-transparent hover:border-reddit-border focus:border-reddit-blue focus:outline-none pb-0.5"
          placeholder="Rule name..."
        />

        <button
          onClick={onRemove}
          className="text-xs text-reddit-text-muted hover:text-reddit-red transition-colors"
        >
          Delete rule
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-reddit-text-muted uppercase tracking-wider">
              IF
            </span>
            <div className="flex items-center gap-2">
              <select
                value={rule.conditionCombination}
                onChange={(e) => onUpdate({ ...rule, conditionCombination: e.target.value as "all" | "any" })}
                className="text-xs bg-reddit-dark border border-reddit-border rounded px-2 py-0.5 text-reddit-text-secondary"
              >
                <option value="all">ALL match</option>
                <option value="any">ANY match</option>
              </select>
              <button
                onClick={addCondition}
                className="text-xs text-reddit-blue hover:text-reddit-text-primary transition-colors"
              >
                + Add
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {rule.conditions.length === 0 ? (
              <div className="text-xs text-reddit-text-muted italic p-2 border border-dashed border-reddit-border rounded">
                No conditions — rule applies to all posts
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
                  onRemove={() => {
                    const conditions = rule.conditions.filter((_, i) => i !== ci);
                    onUpdate({ ...rule, conditions });
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-reddit-text-muted uppercase tracking-wider">
              THEN
            </span>
            <button
              onClick={addAction}
              className="text-xs text-reddit-blue hover:text-reddit-text-primary transition-colors"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {rule.actions.length === 0 ? (
              <div className="text-xs text-reddit-text-muted italic p-2 border border-dashed border-reddit-border rounded">
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
                  onRemove={() => {
                    const actions = rule.actions.filter((_, i) => i !== ai);
                    onUpdate({ ...rule, actions });
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DragMode({ ast, onASTChange }: DragModeProps) {
  const addRule = () => {
    const newRule: AutomodRule = {
      id: generateId(),
      name: `Rule ${ast.length + 1}`,
      conditions: [{ id: generateId(), type: "karma", operator: "<", value: "10" }],
      conditionCombination: "all",
      actions: [{ id: generateId(), type: "remove" }],
      priority: ast.length,
    };
    onASTChange([...ast, newRule]);
  };

  const updateRule = (idx: number, updated: AutomodRule) => {
    const next = [...ast];
    next[idx] = updated;
    onASTChange(next);
  };

  const removeRule = (idx: number) => {
    onASTChange(ast.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...ast];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onASTChange(next);
  };

  const moveDown = (idx: number) => {
    if (idx === ast.length - 1) return;
    const next = [...ast];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onASTChange(next);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-reddit-darker border-b border-reddit-border shrink-0">
        <span className="text-xs text-reddit-text-muted">
          Visual rule builder — changes sync instantly to Code mode
        </span>
        <div className="flex-1" />
        <button onClick={addRule} className="btn-primary text-xs">
          + Add Rule
        </button>
      </div>

      {/* Rules list */}
      <div className="flex-1 overflow-auto p-4">
        {ast.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-4xl opacity-30">⬡</div>
            <div className="text-reddit-text-muted text-sm">No rules yet</div>
            <button onClick={addRule} className="btn-primary">
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
            className="w-full py-3 border border-dashed border-reddit-border rounded-lg text-reddit-text-muted hover:text-reddit-text-secondary hover:border-reddit-text-muted transition-colors text-sm"
          >
            + Add another rule
          </button>
        )}
      </div>
    </div>
  );
}
