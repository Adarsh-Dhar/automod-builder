import yaml from "js-yaml";
import type {
  AutomodAST,
  AutomodRule,
  AutomodCondition,
  AutomodAction,
  AutomodConditionType,
  AutomodActionType,
  AutomodOperator,
} from "../types";

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function parseConditions(raw: Record<string, unknown>): AutomodCondition[] {
  const conditions: AutomodCondition[] = [];

  const conditionMap: Record<string, AutomodConditionType> = {
    comment_karma: "karma",
    link_karma: "karma",
    combined_karma: "karma",
    account_age: "account_age",
    author_flair_text: "author_flair",
    body: "body_regex",
    title: "title_regex",
    domain: "domain",
    url: "url_regex",
    subreddit: "subreddit",
    link_flair_text: "link_flair",
    is_top_level: "is_top_level",
  };

  for (const [key, value] of Object.entries(raw)) {
    const type = conditionMap[key];
    if (!type) continue;

    if (key === "is_top_level") {
      conditions.push({
        id: generateId(),
        type: "is_top_level",
        operator: "==",
        value: String(value),
      });
      continue;
    }

    if (typeof value === "string") {
      if (value.startsWith("< ") || value.startsWith("> ") || value.startsWith("<= ") || value.startsWith(">= ")) {
        const parts = value.split(" ");
        const op = parts[0] as AutomodOperator;
        const num = parts[1];
        conditions.push({ id: generateId(), type, operator: op, value: num });
      } else {
        conditions.push({ id: generateId(), type, operator: "includes", value });
      }
    } else if (typeof value === "number") {
      conditions.push({ id: generateId(), type, operator: ">=", value });
    } else if (Array.isArray(value)) {
      value.forEach((v) => {
        conditions.push({
          id: generateId(),
          type,
          operator: "includes",
          value: String(v),
        });
      });
    }
  }

  return conditions;
}

function parseActions(raw: Record<string, unknown>): AutomodAction[] {
  const actions: AutomodAction[] = [];
  const actionKeys: Record<string, AutomodActionType> = {
    action: "remove",
    remove: "remove",
    approve: "approve",
    report: "report",
    spam: "spam",
    lock: "lock",
    set_flair: "set_flair",
  };

  for (const [key, value] of Object.entries(raw)) {
    if (key === "action") {
      const v = String(value);
      if (["remove", "approve", "spam"].includes(v)) {
        actions.push({ id: generateId(), type: v as AutomodActionType });
      }
    } else if (key === "report_reason") {
      actions.push({ id: generateId(), type: "report", value: String(value) });
    } else if (key === "lock") {
      actions.push({ id: generateId(), type: "lock" });
    } else if (key === "set_flair") {
      actions.push({ id: generateId(), type: "set_flair", value: String(value) });
    } else if (actionKeys[key] && key !== "action") {
      actions.push({ id: generateId(), type: actionKeys[key] });
    }
  }

  return actions;
}

export function yamlToAST(yamlStr: string): AutomodAST {
  if (!yamlStr.trim()) return [];

  try {
    const docs: unknown[] = [];
    yaml.loadAll(yamlStr, (doc) => { if (doc) docs.push(doc); });

    return docs.map((doc, idx) => {
      const d = doc as Record<string, unknown>;
      const rule: AutomodRule = {
        id: generateId(),
        name: (d.name as string) || `Rule ${idx + 1}`,
        description: d.comment as string | undefined,
        conditions: parseConditions(d),
        conditionCombination: (d.match_fields as "all" | "any") || "all",
        actions: parseActions(d),
        priority: idx,
      };
      return rule;
    });
  } catch {
    return [];
  }
}

function conditionToYaml(condition: AutomodCondition): Record<string, unknown> {
  const keyMap: Record<string, string> = {
    karma: "combined_karma",
    account_age: "account_age",
    author_flair: "author_flair_text",
    body_regex: "body",
    title_regex: "title",
    domain: "domain",
    url_regex: "url",
    subreddit: "subreddit",
    link_flair: "link_flair_text",
    is_new_account: "account_age",
    is_top_level: "is_top_level",
  };

  const key = keyMap[condition.type] || condition.type;

  if (condition.type === "is_top_level") {
    return { [key]: condition.value === "true" || condition.value === true };
  }

  if (["karma", "account_age"].includes(condition.type)) {
    return { [key]: `${condition.operator} ${condition.value}` };
  }

  return { [key]: condition.value };
}

function actionToYaml(action: AutomodAction): Record<string, unknown> {
  switch (action.type) {
    case "remove":
      return { action: "remove" };
    case "approve":
      return { action: "approve" };
    case "spam":
      return { action: "spam" };
    case "report":
      return { report_reason: action.value || "Reported by AutoModerator" };
    case "lock":
      return { lock: true };
    case "set_flair":
      return { set_flair: action.value || "" };
    default:
      return {};
  }
}

export function astToYaml(ast: AutomodAST): string {
  if (!ast.length) return "";

  const docs = ast.map((rule) => {
    const doc: Record<string, unknown> = {};

    if (rule.name && rule.name !== `Rule ${rule.priority + 1}`) {
      doc.name = rule.name;
    }

    if (rule.description) {
      doc.comment = rule.description;
    }

    if (rule.conditions.length > 1) {
      doc.match_fields = rule.conditionCombination;
    }

    for (const cond of rule.conditions) {
      const condYaml = conditionToYaml(cond);
      Object.assign(doc, condYaml);
    }

    for (const action of rule.actions) {
      const actionYaml = actionToYaml(action);
      Object.assign(doc, actionYaml);
    }

    return doc;
  });

  return docs.map((doc) => yaml.dump(doc, { indent: 2, lineWidth: 80 })).join("---\n");
}

export function validateYaml(yamlStr: string): { valid: boolean; error?: string } {
  if (!yamlStr.trim()) return { valid: true };
  try {
    const docs: unknown[] = [];
    yaml.loadAll(yamlStr, (doc) => { if (doc) docs.push(doc); });
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
