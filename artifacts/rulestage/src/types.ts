export type AutomodConditionType =
  | "karma"
  | "account_age"
  | "author_flair"
  | "body_regex"
  | "title_regex"
  | "domain"
  | "url_regex"
  | "subreddit"
  | "link_flair"
  | "is_top_level";

export type AutomodActionType =
  | "remove"
  | "approve"
  | "report"
  | "spam"
  | "lock"
  | "set_flair";

export type AutomodOperator = ">" | "<" | ">=" | "<=" | "==" | "includes" | "matches";

export interface AutomodCondition {
  id: string;
  type: AutomodConditionType;
  operator: AutomodOperator;
  value: string | number;
}

export interface AutomodAction {
  id: string;
  type: AutomodActionType;
  value?: string;
}

export interface AutomodRule {
  id: string;
  name: string;
  description?: string;
  conditions: AutomodCondition[];
  conditionCombination: "all" | "any";
  actions: AutomodAction[];
  priority: number;
}

export type AutomodAST = AutomodRule[];

export interface MockPost {
  id: string;
  title: string;
  body: string;
  author: string;
  authorKarma: number;
  accountAgeDays: number;
  domain: string;
  url: string;
  subreddit: string;
  isTopLevel: boolean;
  createdAt: number;
}

export interface SimulationResult {
  postId: string;
  postTitle: string;
  postAuthor: string;
  matchedRules: string[];
  action: AutomodActionType | "none";
  reasons: string[];
}

export interface SimulationDiff {
  totalPosts: number;
  removed: SimulationResult[];
  approved: SimulationResult[];
  reported: SimulationResult[];
  untouched: SimulationResult[];
  runAt: number;
}

export type ViewMode = "code" | "drag" | "chat";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
