export type ViewMode = 'code' | 'drag' | 'chat';

export type AutomodConditionType =
  | 'karma'
  | 'account_age'
  | 'title_regex'
  | 'body_regex'
  | 'domain'
  | 'url_regex'
  | 'is_top_level';

export type ExtConditionType = AutomodConditionType |
  'combined_karma'
  | 'author_flair'
  | 'crosspost_subreddit'
  | 'post_type'
  | 'link_flair'
  | 'num_comments';

export type AutomodActionType = 'remove' | 'spam' | 'approve' | 'report' | 'lock' | 'set_flair';

export type ExtActionType = AutomodActionType |
  'add_moderator_report'
  | 'set_suggested_sort'
  | 'reply'
  | 'ignore_reports'
  | 'stickied';

export type AutomodCondition = {
  id: string;
  type: ExtConditionType;
  operator: '<' | '<=' | '>' | '>=' | '==';
  value: string;
};

export type AutomodAction = {
  id: string;
  type: ExtActionType;
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
  debugResult?: any;
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