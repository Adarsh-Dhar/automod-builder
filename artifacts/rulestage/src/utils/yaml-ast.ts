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

// Parse a comparison string like "< 30", "< 30 days", "> 100" etc.
function parseComparison(
  value: unknown,
  type: AutomodConditionType
): AutomodCondition | null {
  if (typeof value === "number") {
    return { id: generateId(), type, operator: ">=", value: String(value) };
  }
  if (typeof value !== "string") return null;

  // Strip trailing unit words like "days", "months"
  const cleaned = value.trim().replace(/\s+(days|months|years|hours)$/i, "").trim();

  const match = cleaned.match(/^([<>]=?|==)\s*(-?\d+(?:\.\d+)?)$/);
  if (match) {
    return {
      id: generateId(),
      type,
      operator: match[1] as AutomodOperator,
      value: match[2],
    };
  }
  return null;
}

// Fields that belong inside an author: subgroup
const AUTHOR_CONDITION_MAP: Record<string, AutomodConditionType> = {
  account_age: "account_age",
  combined_karma: "karma",
  comment_karma: "karma",
  post_karma: "karma",
  link_karma: "karma",
};

// Root-level content condition fields and their variations
const CONTENT_CONDITION_MAP: Record<string, AutomodConditionType> = {
  // Plain keys
  title: "title_regex",
  body: "body_regex",
  domain: "domain",
  url: "url_regex",
  subreddit: "subreddit",
  is_top_level: "is_top_level",
  author_flair_text: "author_flair",
  link_flair_text: "link_flair",
  // Modifiers — "title (includes)", "title (regex)", "body (includes)", etc.
  "title (includes)": "title_regex",
  "title (regex)": "title_regex",
  "title+body (includes)": "title_regex",
  "title+body (regex)": "title_regex",
  "body (includes)": "body_regex",
  "body (regex)": "body_regex",
  "url (includes)": "url_regex",
  "url (regex)": "url_regex",
};

function parseConditions(raw: Record<string, unknown>): AutomodCondition[] {
  const conditions: AutomodCondition[] = [];

  for (const [key, value] of Object.entries(raw)) {
    // ── Author subgroup ──────────────────────────────────────────────────────
    if (key === "author" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const authorObj = value as Record<string, unknown>;
      for (const [aKey, aValue] of Object.entries(authorObj)) {
        if (aKey === "satisfy_any_threshold" || aKey === "satisfy_any") continue;
        const aType = AUTHOR_CONDITION_MAP[aKey];
        if (!aType) continue;
        const cond = parseComparison(aValue, aType);
        if (cond) conditions.push(cond);
      }
      continue;
    }

    // ── Content conditions ────────────────────────────────────────────────────
    const type = CONTENT_CONDITION_MAP[key];
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

    if (Array.isArray(value)) {
      // title (includes): ['phrase one', 'phrase two']
      value.forEach((v) => {
        conditions.push({
          id: generateId(),
          type,
          operator: "includes",
          value: String(v),
        });
      });
    } else if (typeof value === "string") {
      // Could be a comparison "< 30" or a pattern/phrase
      const cmp = parseComparison(value, type);
      if (cmp) {
        conditions.push(cmp);
      } else {
        conditions.push({ id: generateId(), type, operator: "includes", value });
      }
    } else if (typeof value === "number") {
      conditions.push({ id: generateId(), type, operator: ">=", value: String(value) });
    }
  }

  return conditions;
}

function parseActions(raw: Record<string, unknown>): AutomodAction[] {
  const actions: AutomodAction[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (key === "action") {
      const v = String(value);
      if (["remove", "approve", "spam", "filter"].includes(v)) {
        actions.push({ id: generateId(), type: v as AutomodActionType });
      }
    } else if (key === "report_reason") {
      actions.push({ id: generateId(), type: "report", value: String(value) });
    } else if (key === "lock" && value === true) {
      actions.push({ id: generateId(), type: "lock" });
    } else if (key === "set_flair") {
      actions.push({ id: generateId(), type: "set_flair", value: String(value) });
    }
  }

  return actions;
}

export function yamlToAST(yamlStr: string): AutomodAST {
  if (!yamlStr.trim()) return [];

  try {
    const docs: unknown[] = [];
    yaml.loadAll(yamlStr, (doc) => {
      if (doc) docs.push(doc);
    });

    return docs.map((doc, idx) => {
      const d = doc as Record<string, unknown>;

      // Derive rule name from the first YAML comment if available
      const conditions = parseConditions(d);

      // Detect satisfy_any_threshold inside author block for conditionCombination
      const authorBlock = d.author as Record<string, unknown> | undefined;
      const hasSatisfyAny =
        authorBlock?.satisfy_any_threshold === true ||
        authorBlock?.satisfy_any === true;

      const rule: AutomodRule = {
        id: generateId(),
        name: (d.name as string) || `Rule ${idx + 1}`,
        description: d.comment as string | undefined,
        conditions,
        conditionCombination: hasSatisfyAny ? "any" : ((d.match_fields as "all" | "any") || "all"),
        actions: parseActions(d),
        priority: idx,
      };
      return rule;
    });
  } catch {
    return [];
  }
}

// ── AST → YAML ───────────────────────────────────────────────────────────────

const AUTHOR_CONDITION_TYPES: AutomodConditionType[] = ["karma", "account_age"];

function conditionToContentYaml(condition: AutomodCondition): Record<string, unknown> {
  const keyMap: Record<string, string> = {
    author_flair: "author_flair_text",
    body_regex: "body (regex)",
    title_regex: "title (regex)",
    domain: "domain",
    url_regex: "url (regex)",
    subreddit: "subreddit",
    link_flair: "link_flair_text",
    is_top_level: "is_top_level",
  };

  const key = keyMap[condition.type] || condition.type;

  if (condition.type === "is_top_level") {
    return { [key]: String(condition.value) === "true" };
  }

  return { [key]: condition.value };
}

function authorConditionToBlock(
  conditions: AutomodCondition[]
): Record<string, unknown> {
  const block: Record<string, unknown> = {};

  for (const cond of conditions) {
    if (cond.type === "account_age") {
      block.account_age = `"${cond.operator} ${cond.value} days"`;
    } else if (cond.type === "karma") {
      // Use combined_karma as the canonical output key
      block.combined_karma = `"${cond.operator} ${cond.value}"`;
    }
  }

  return block;
}

export function astToYaml(ast: AutomodAST): string {
  if (!ast.length) return "";

  const docs = ast.map((rule) => {
    const doc: Record<string, unknown> = {};

    if (rule.name && !rule.name.match(/^Rule \d+$/)) {
      doc.name = rule.name;
    }

    if (rule.description) {
      doc.comment = rule.description;
    }

    const authorConditions = rule.conditions.filter((c) =>
      AUTHOR_CONDITION_TYPES.includes(c.type)
    );
    const contentConditions = rule.conditions.filter(
      (c) => !AUTHOR_CONDITION_TYPES.includes(c.type)
    );

    // Content conditions go at the root
    for (const cond of contentConditions) {
      const condYaml = conditionToContentYaml(cond);
      Object.assign(doc, condYaml);
    }

    // Author conditions go in a nested author: block (correct Reddit format)
    if (authorConditions.length > 0) {
      const authorBlock = authorConditionToBlock(authorConditions);
      if (authorConditions.length > 1 && rule.conditionCombination === "any") {
        authorBlock.satisfy_any_threshold = true;
      }
      doc.author = authorBlock;
    } else if (rule.conditions.length > 1) {
      doc.match_fields = rule.conditionCombination;
    }

    for (const action of rule.actions) {
      Object.assign(doc, actionToYaml(action));
    }

    return doc;
  });

  return docs
    .map((doc) => yaml.dump(doc, { indent: 2, lineWidth: 80 }))
    .join("---\n");
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

export function validateYaml(yamlStr: string): { valid: boolean; error?: string } {
  if (!yamlStr.trim()) return { valid: true };
  try {
    const docs: unknown[] = [];
    yaml.loadAll(yamlStr, (doc) => {
      if (doc) docs.push(doc);
    });
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
