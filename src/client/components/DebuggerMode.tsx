import { useState } from 'react';
import DebugResultCard from './DebugResultCard';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import type { DebugResponse, DebugComparison } from '../../shared/debug-types';
import { parsePostId } from '../utils/debug';
import { saveMockTest, type SavedMockTest } from '../utils/mock-tests';

type DebuggerModeProps = {
  onApplyYaml: (yaml: string, source?: 'chat' | 'code' | 'debugger' | 'decoder' | 'escape-hatch' | 'restore') => void;
  onTestSaved?: (test: SavedMockTest) => void;
};

export default function DebuggerMode({ onApplyYaml, onTestSaved }: DebuggerModeProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock post form state
  const [mockTitle, setMockTitle] = useState('Check out this amazing product');
  const [mockBody, setMockBody] = useState('I genuinely love this product and wanted to share');
  const [mockAuthor, setMockAuthor] = useState('newuser123');
  const [mockAccountAge, setMockAccountAge] = useState('7');
  const [mockCombinedKarma, setMockCombinedKarma] = useState('15');
  const [mockLinkKarma, setMockLinkKarma] = useState('10');
  const [mockCommentKarma, setMockCommentKarma] = useState('5');
  const [mockSubreddit, setMockSubreddit] = useState('r/shopping');
  const [mockDomain, setMockDomain] = useState('amazon.com');
  const [mockUrl, setMockUrl] = useState('https://amazon.com/product/123');
  const [mockIsSelf, setMockIsSelf] = useState(false);
  const [mockOver18, setMockOver18] = useState(false);
  const [mockSpoiler, setMockSpoiler] = useState(false);
  const [mockStickied, setMockStickied] = useState(false);
  const [mockNumComments, setMockNumComments] = useState('3');
  const [mockScore, setMockScore] = useState('2');
  const [mockUpvoteRatio, setMockUpvoteRatio] = useState('0.6');
  const [mockAuthorFlairText, setMockAuthorFlairText] = useState('');
  const [mockLinkFlairText, setMockLinkFlairText] = useState('');
  const [mockDistinguished, setMockDistinguished] = useState('');
  const [mockLoading, setMockLoading] = useState(false);
  const [comparison, setComparison] = useState<DebugComparison | null>(null);
  const [mockError, setMockError] = useState<string | null>(null);
  const [testCounter, setTestCounter] = useState(1);

  // Check if YAML has actual content (not empty/default/template)
  const hasRealYaml = result?.aiFixYaml && !result.aiFixYaml.includes("# Rule draft") && !result.aiFixYaml.includes("title (includes): ['']") && result.aiFixYaml.trim().length > 50;

  // Only show the entire card if there's real YAML to apply
  const shouldShowCard = hasRealYaml;

  const handleDebug = async () => {
    setError(null);
    const postId = parsePostId(input);
    if (!postId) {
      setError('Enter a valid post id or URL');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rule-stage/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });

      if (!res.ok) throw new Error('Debug API failed');

      const data = (await res.json()) as { status: string; debug?: DebugResponse };
      if (data?.debug) {
        setResult(data.debug);
      } else {
        setError('No debug result returned');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleMockDebug = async () => {
    setMockError(null);
    setMockLoading(true);
    try {
      const res = await fetch('/api/rule-stage/debug-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockPost: {
            title: mockTitle,
            body: mockBody,
            author: mockAuthor,
            accountAgeDays: Number.parseInt(mockAccountAge, 10) || 0,
            combinedKarma: Number.parseInt(mockCombinedKarma, 10) || 0,
            linkKarma: Number.parseInt(mockLinkKarma, 10) || 0,
            commentKarma: Number.parseInt(mockCommentKarma, 10) || 0,
            subreddit: mockSubreddit,
            domain: mockDomain,
            url: mockUrl,
            isSelf: mockIsSelf,
            over18: mockOver18,
            spoiler: mockSpoiler,
            stickied: mockStickied,
            numComments: Number.parseInt(mockNumComments, 10) || 0,
            score: Number.parseInt(mockScore, 10) || 0,
            upvoteRatio: Number.parseFloat(mockUpvoteRatio) || 1,
            authorFlairText: mockAuthorFlairText,
            linkFlairText: mockLinkFlairText,
            distinguished: mockDistinguished,
          },
        }),
      });

      if (!res.ok) throw new Error('Mock debug API failed');

      const data = (await res.json()) as { status: string; comparison?: DebugComparison };
      if (data?.comparison) {
        setComparison(data.comparison);
      } else {
        setMockError('No comparison result returned');
      }
    } catch (e) {
      setMockError((e as Error).message);
    } finally {
      setMockLoading(false);
    }
  };

  const handleSaveMockTest = () => {
    const mockPost = {
      title: mockTitle,
      body: mockBody,
      author: mockAuthor,
      accountAgeDays: Number.parseInt(mockAccountAge, 10) || 0,
      combinedKarma: Number.parseInt(mockCombinedKarma, 10) || 0,
      linkKarma: Number.parseInt(mockLinkKarma, 10) || 0,
      commentKarma: Number.parseInt(mockCommentKarma, 10) || 0,
      subreddit: mockSubreddit,
      domain: mockDomain,
      url: mockUrl,
      isSelf: mockIsSelf,
      over18: mockOver18,
      spoiler: mockSpoiler,
      stickied: mockStickied,
      numComments: Number.parseInt(mockNumComments, 10) || 0,
      score: Number.parseInt(mockScore, 10) || 0,
      upvoteRatio: Number.parseFloat(mockUpvoteRatio) || 1,
      authorFlairText: mockAuthorFlairText,
      linkFlairText: mockLinkFlairText,
      distinguished: mockDistinguished,
    };

    const updated = saveMockTest(mockPost, `Mock Test #${testCounter}`);
    setTestCounter(testCounter + 1);

    const savedTest = updated[0];
    if (savedTest && onTestSaved) {
      onTestSaved(savedTest);
    }
  };

  return (
    <div className="p-3 md:p-5 grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Test by Link Section */}
        <Card className="p-4">
          <p className="text-sm text-[--muted-foreground]">Enter a Reddit post URL or ID to inspect why AutoModerator triggered.</p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. https://reddit.com/r/sub/comments/abc123/ or abc123"
              className="flex-1 rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
            />
            <Button onClick={handleDebug} disabled={loading} size="sm">
              {loading ? 'Running...' : 'Debug Post'}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-[--warning]">{error}</p>}
        </Card>

        {/* Create Mock Post Section */}
        <Card className="p-4">
          <p className="text-sm text-[--muted-foreground]">Create a mock post to test moderation rules.</p>
          <div className="mt-3 space-y-3">
            {/* Basic Info */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[--foreground]">Basic Info</p>
              <input
                value={mockTitle}
                onChange={(e) => setMockTitle(e.target.value)}
                placeholder="Post title"
                className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
              />
              <Textarea
                value={mockBody}
                onChange={(e) => setMockBody(e.target.value)}
                placeholder="Post body"
                className="min-h-[60px] w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
              />
              <input
                value={mockAuthor}
                onChange={(e) => setMockAuthor(e.target.value)}
                placeholder="Author username"
                className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
              />
              <input
                value={mockSubreddit}
                onChange={(e) => setMockSubreddit(e.target.value)}
                placeholder="Subreddit (e.g., r/AskReddit)"
                className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
              />
            </div>

            {/* Author Stats */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[--foreground]">Author Stats</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Account age (days)</label>
                  <input
                    type="number"
                    value={mockAccountAge}
                    onChange={(e) => setMockAccountAge(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Combined karma</label>
                  <input
                    type="number"
                    value={mockCombinedKarma}
                    onChange={(e) => setMockCombinedKarma(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Link karma</label>
                  <input
                    type="number"
                    value={mockLinkKarma}
                    onChange={(e) => setMockLinkKarma(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Comment karma</label>
                  <input
                    type="number"
                    value={mockCommentKarma}
                    onChange={(e) => setMockCommentKarma(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Post Stats */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[--foreground]">Post Stats</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Number of comments</label>
                  <input
                    type="number"
                    value={mockNumComments}
                    onChange={(e) => setMockNumComments(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Score (upvotes - downvotes)</label>
                  <input
                    type="number"
                    value={mockScore}
                    onChange={(e) => setMockScore(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Upvote ratio (0-1)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={mockUpvoteRatio}
                    onChange={(e) => setMockUpvoteRatio(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Post Details */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[--foreground]">Post Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Domain</label>
                  <input
                    value={mockDomain}
                    onChange={(e) => setMockDomain(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">URL</label>
                  <input
                    value={mockUrl}
                    onChange={(e) => setMockUrl(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="flex items-center gap-2 text-xs text-[--foreground]">
                  <input
                    type="checkbox"
                    checked={mockIsSelf}
                    onChange={(e) => setMockIsSelf(e.target.checked)}
                    className="rounded"
                  />
                  Self post
                </label>
                <label className="flex items-center gap-2 text-xs text-[--foreground]">
                  <input
                    type="checkbox"
                    checked={mockOver18}
                    onChange={(e) => setMockOver18(e.target.checked)}
                    className="rounded"
                  />
                  NSFW
                </label>
                <label className="flex items-center gap-2 text-xs text-[--foreground]">
                  <input
                    type="checkbox"
                    checked={mockSpoiler}
                    onChange={(e) => setMockSpoiler(e.target.checked)}
                    className="rounded"
                  />
                  Spoiler
                </label>
                <label className="flex items-center gap-2 text-xs text-[--foreground]">
                  <input
                    type="checkbox"
                    checked={mockStickied}
                    onChange={(e) => setMockStickied(e.target.checked)}
                    className="rounded"
                  />
                  Stickied
                </label>
              </div>
            </div>

            {/* Flair */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[--foreground]">Flair</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Author flair text</label>
                  <input
                    value={mockAuthorFlairText}
                    onChange={(e) => setMockAuthorFlairText(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[--muted-foreground] mb-1 block">Link flair text</label>
                  <input
                    value={mockLinkFlairText}
                    onChange={(e) => setMockLinkFlairText(e.target.value)}
                    className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[--muted-foreground] mb-1 block">Distinguished</label>
                <input
                  value={mockDistinguished}
                  onChange={(e) => setMockDistinguished(e.target.value)}
                  className="w-full rounded-xl border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleMockDebug} disabled={mockLoading} className="flex-1" size="sm">
                {mockLoading ? 'Testing...' : 'Test Mock Post'}
              </Button>
              <Button onClick={handleSaveMockTest} variant="outline" size="sm">
                Save Test
              </Button>
            </div>
          </div>
          {mockError && <p className="mt-2 text-xs text-[--warning]">{mockError}</p>}
        </Card>
      </div>

      {/* Comparison Results */}
      {comparison && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[--foreground] mb-3">Moderation Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Draft Rule Result */}
            <div className="p-3 rounded-lg bg-[--surface-2]">
              <p className="text-xs font-medium text-[--muted-foreground] mb-2">Draft Rule</p>
              <div className="space-y-1">
                <p className="text-sm text-[--foreground]">
                  Status: <span className={comparison.draftResult.matched ? 'text-red-500' : 'text-green-500'}>
                    {comparison.draftResult.matched ? 'Would Match' : 'Would Pass'}
                  </span>
                </p>
                <p className="text-sm text-[--foreground]">
                  Action: <span className="font-medium">{comparison.draftResult.action}</span>
                </p>
                {comparison.draftResult.matchedCondition && (
                  <p className="text-xs text-[--muted-foreground]">
                    Matched: {comparison.draftResult.matchedCondition.field} {comparison.draftResult.matchedCondition.comparator} {comparison.draftResult.matchedCondition.value}
                  </p>
                )}
              </div>
            </div>

            {/* Live Config Result */}
            <div className="p-3 rounded-lg bg-[--surface-2]">
              <p className="text-xs font-medium text-[--muted-foreground] mb-2">Live Config</p>
              <div className="space-y-1">
                <p className="text-sm text-[--foreground]">
                  Status: <span className={comparison.liveResult.matched ? 'text-red-500' : 'text-green-500'}>
                    {comparison.liveResult.matched ? 'Would Match' : 'Would Pass'}
                  </span>
                </p>
                {comparison.liveResult.matched && comparison.liveResult.action && (
                  <p className="text-sm text-[--foreground]">
                    Action: <span className="font-medium">{comparison.liveResult.action}</span>
                  </p>
                )}
                {comparison.liveResult.matches.length > 0 && comparison.liveResult.matches[0] && (
                  <p className="text-xs text-[--muted-foreground]">
                    Matched rule: {comparison.liveResult.matches[0].ruleName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Differences */}
          {comparison.differences.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-[--warning]/10 border border-[--warning]/30">
              <p className="text-xs font-medium text-[--warning] mb-1">Differences detected:</p>
              <ul className="text-xs text-[--foreground] list-disc list-inside space-y-1">
                {comparison.differences.map((diff, i) => (
                  <li key={i}>{diff}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {shouldShowCard && (
        <DebugResultCard result={result} onApplyYaml={(yaml) => onApplyYaml(yaml, 'debugger')} />
      )}
    </div>
  );
}
