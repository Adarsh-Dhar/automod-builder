export type ViewMode = 'code' | 'drag' | 'chat';

export type AutomodConditionType =
  | 'karma'
  | 'account_age'
  | 'title_regex'
  | 'body_regex'
  | 'domain'
  | 'url_regex'
  | 'is_top_level';

export type AutomodActionType = 'remove' | 'spam' | 'approve' | 'report' | 'lock' | 'set_flair';

export type AutomodCondition = {
  id: string;
  type: AutomodConditionType;
  operator: '<' | '<=' | '>' | '>=' | '==';
  value: string;
};

export type AutomodAction = {
  id: string;
  type: AutomodActionType;
  value?: string;
};

export type AutomodRule = {
  id: string;
  name: string;
  conditionCombination: 'all' | 'any';
  conditions: AutomodCondition[];
  actions: AutomodAction[];
};

export type AutomodAST = AutomodRule[];

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  debugResult?: import('../../shared/debug-types').DebugResponse;
};

export type SimulationResult = {
  postId: string;
  postTitle: string;
  postAuthor: string;
  action: 'remove' | 'report' | 'approve' | 'spam' | 'lock' | 'none';
  reasons: string[];
};

export type SimulationDiff = {
  removed: SimulationResult[];
  reported: SimulationResult[];
  approved: SimulationResult[];
  untouched: SimulationResult[];
  totalPosts: number;
  runAt: number;
};