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

export type MockPostDebugRequest = {
  title: string;
  body: string;
  author: string;
  accountAgeDays: number;
  combinedKarma: number;
  linkKarma: number;
  commentKarma: number;
  subreddit: string;
  domain: string;
  url: string;
  isSelf: boolean;
  over18: boolean;
  spoiler: boolean;
  stickied: boolean;
  numComments: number;
  score: number;
  upvoteRatio: number;
  authorFlairText: string;
  linkFlairText: string;
  distinguished: string;
};

export type DebugComparison = {
  draftResult: {
    matched: boolean;
    action: 'remove' | 'approve' | 'report';
    matchedCondition?: DebugCondition;
  };
  liveResult: {
    matched: boolean;
    matches: DebugMatch[];
    action?: 'remove' | 'approve' | 'report';
  };
  differences: string[];
};