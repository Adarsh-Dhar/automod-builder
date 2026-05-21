export type DebugConditionField = 'title' | 'body' | 'account_age' | 'combined_karma';

export type DebugConditionComparator = 'includes' | 'matches' | '<' | '>' | '<=' | '>=';

export type DebugCondition = {
  field: DebugConditionField;
  comparator: DebugConditionComparator;
  value: string;
};

export type DebugConfidence = 'high' | 'medium' | 'low';

export type PostDebugRequest = {
  postId: string;
  subredditName?: string;
};

export type DebugMatch = {
  ruleName: string;
  rawYaml: string;
  matchedCondition: DebugCondition;
  lineStart: number;
  lineEnd: number;
  confidence: DebugConfidence;
};

export type DebugResponse = {
  postId: string;
  subredditName?: string;
  postTitle: string;
  postBody: string;
  postAuthor: string;
  matches: DebugMatch[];
  aiFixYaml: string;
};