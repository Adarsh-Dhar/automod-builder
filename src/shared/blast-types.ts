export type CachedPost = {
  id: string;
  title: string;
  body: string;
  author: string;
  accountAgeDays: number;
  combinedKarma: number;
  createdAt: number;
  isSpam: boolean;
  wasRemoved: boolean;
};

export type BlastRadiusResult = {
  totalTested: number;
  wouldCatch: number;
  falsePositives: CachedPost[];
  missedSpam: CachedPost[];
  caughtPosts: CachedPost[];
  catchRate: number;
  falsePositiveRate: number;
};