import { useInit } from '../contexts/init-context';
import ChatMode from '../components/ChatMode';
import DebuggerMode from '../components/DebuggerMode';
import HistoryPanel from '../components/HistoryPanel';
import { useEffect, useState, useRef } from 'react';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { useToast } from '../hooks/use-toast';
import { PageTopbar } from '../components/layout/PageTopbar';
import { ModeTabStrip } from '../components/layout/ModeTabStrip';
import { RightPanel } from '../components/layout/RightPanel';
import {
  DEFAULT_AUTOMOD_RULE,
  extractFirstRule,
  hasMultipleRules,
  parseAutomodRuleDraft,
  serializeAutomodRule,
  buildSimulationPost,
  evaluateRule,
  type AutomodAction,
  type AutomodRule,
  type RuleStageMode,
  type YamlLimitation,
} from '../../shared/automod';
import type { BlastRadiusResult } from '../../shared/blast-types';
import { getSnapshots, saveSnapshot, type HistorySnapshot } from '../utils/history';
import { getMockTests, type SavedMockTest } from '../utils/mock-tests';
import { saveMatrixCell, getMatrixCell, type MatrixCell } from '../utils/test-matrix';
import TestMatrixView from '../components/TestMatrixView';

type RuleStageInitResponse = {
  status: 'success';
  rule: AutomodRule;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

function cloneRule(rule: AutomodRule): AutomodRule {
  return {
    ...rule,
    conditions: rule.conditions.map((condition) => ({ ...condition })),
  };
}

export function RuleStagePage() {
  const { init } = useInit();
  const { toast } = useToast();
  const [mode, setMode] = useState<RuleStageMode>('code');
  const [rule, setRule] = useState<AutomodRule>(DEFAULT_AUTOMOD_RULE);
  const [draft, setDraft] = useState(() => serializeAutomodRule(DEFAULT_AUTOMOD_RULE));
  const [blast, setBlast] = useState<BlastRadiusResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changes, setChanges] = useState<HistorySnapshot[]>(getSnapshots());
  const [mockTests, setMockTests] = useState<SavedMockTest[]>(getMockTests());
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        setLoading(true);
        // First try to load the live wiki YAML
        const liveRes = await fetch('/api/rule-stage/live-yaml');
        if (liveRes.ok) {
          const liveData = await liveRes.json() as { status: string; yaml: string };
          if (liveData.status === 'success' && liveData.yaml?.trim()) {
            const parsed = parseAutomodRuleDraft(liveData.yaml, DEFAULT_AUTOMOD_RULE);
            if (isActive) {
              setRule(parsed);
              setDraft(liveData.yaml);
              setLoading(false);
              return;
            }
          }
        }
        // Fall back to Redis draft via existing init endpoint
        const response = await fetch('/api/rule-stage/init');
        if (!response.ok) {
          throw new Error('Failed to load RuleStage state');
        }

        const data = (await response.json()) as RuleStageInitResponse;
        if (!isActive) {
          return;
        }

        setRule(data.rule);
        setDraft(serializeAutomodRule(data.rule));
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        console.error('RuleStage load failed:', loadError);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Unable to load saved rule state.',
        });
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [toast]);

  const handleAddChatMessage = (message: ChatMessage) => {
    setChatMessages((current) => [...current, message]);
  };

  const publishToWiki = async () => {
    try {
      setPublishing(true);
      const response = await fetch('/api/rule-stage/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: draft }),
      });
      if (!response.ok) throw new Error('Publish failed');
      toast({ title: 'Published', description: 'AutoModerator wiki updated successfully.' });
    } catch (err) {
      console.error('Publish failed:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to publish to subreddit wiki.' });
    } finally {
      setPublishing(false);
    }
  };

  const handleApplyYaml = (yaml: string, source?: HistorySnapshot['source']) => {
    // If YAML contains multiple rules, preserve all rules in the draft
    if (hasMultipleRules(yaml)) {
      setDraft(yaml);
      // Extract first rule for features that need single rule (blast radius, etc.)
      const firstRuleYaml = extractFirstRule(yaml);
      const parsed = parseAutomodRuleDraft(firstRuleYaml, rule);
      setRule(parsed);
      setMode('code');
      void persistRawYaml(yaml);
      // Save snapshot with source
      const ruleCount = yaml.split('---').filter((b) => b.trim()).length;
      const updated = saveSnapshot(yaml, ruleCount, undefined, source);
      setChanges(updated);
    } else {
      // Single rule - parse normally
      const parsed = parseAutomodRuleDraft(yaml, rule);
      setRule(parsed);
      setDraft(serializeAutomodRule(parsed));
      setMode('code');
      void persistRule(parsed);
      // Save snapshot with source
      const updated = saveSnapshot(serializeAutomodRule(parsed), parsed.conditions.length, undefined, source);
      setChanges(updated);
    }
  };

  const refreshBlast = async (nextRule: AutomodRule) => {
    try {
      setBlasting(true);
      const response = await fetch('/api/rule-stage/blast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rule: nextRule }),
      });

      if (!response.ok) {
        throw new Error('Failed to run blast radius');
      }

      const data = (await response.json()) as { status: 'success'; blast: BlastRadiusResult };
      setBlast(data.blast);
    } catch (blastError) {
      console.error('RuleStage blast failed:', blastError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to run the blast radius backtest.',
      });
    } finally {
      setBlasting(false);
    }
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);

    // parse immediately for live preview
    if (hasMultipleRules(value)) {
      const firstRuleYaml = extractFirstRule(value);
      const parsed = parseAutomodRuleDraft(firstRuleYaml, rule);
      setRule(parsed);
      void persistRawYaml(value);
    } else {
      const parsed = parseAutomodRuleDraft(value, rule);
      setRule(parsed);
      void persistRule(parsed);
    }

    // debounce the snapshot save — only fires after 4 seconds of inactivity
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      const ruleCount = hasMultipleRules(value)
        ? value.split('---').filter((b) => b.trim()).length
        : parseAutomodRuleDraft(value, rule).conditions.length;
      const updated = saveSnapshot(value, ruleCount, undefined, 'code');
      setChanges(updated);
    }, 4000);
  };

  const persistRule = async (nextRule: AutomodRule) => {
    try {
      setSaving(true);
      const response = await fetch('/api/rule-stage/rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nextRule),
      });

      if (!response.ok) {
        throw new Error('Failed to save rule');
      }

      await response.json();
      await refreshBlast(nextRule);
    } catch (saveError) {
      console.error('RuleStage save failed:', saveError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to save the current rule.',
      });
    } finally {
      setSaving(false);
    }
  };

  const persistRawYaml = async (yaml: string) => {
    try {
      setSaving(true);
      const response = await fetch('/api/rule-stage/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
      });
      if (!response.ok) throw new Error('Failed to publish');
      await response.json();
    } catch (saveError) {
      console.error('RuleStage raw YAML save failed:', saveError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to save the rule set.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleActionChange = (action: AutomodAction) => {
    const nextRule = cloneRule(rule);
    nextRule.action = action;
    setRule(nextRule);
    setDraft(serializeAutomodRule(nextRule));
    void persistRule(nextRule);
  };

  const handleReset = async () => {
    try {
      const response = await fetch('/api/rule-stage/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to reset RuleStage state');
      }

      const data = (await response.json()) as RuleStageInitResponse;
      setRule(data.rule);
      setDraft(serializeAutomodRule(data.rule));
      await refreshBlast(data.rule);
    } catch (resetError) {
      console.error('RuleStage reset failed:', resetError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to reset RuleStage state.',
      });
    }
  };

  const handleTestSaved = (test: SavedMockTest) => {
    setMockTests(getMockTests());
  };

  const handleRunMatrixCell = async (changeId: string, testId: string): Promise<MatrixCell> => {
    const change = changes.find((c) => c.id === changeId);
    const test = mockTests.find((t) => t.id === testId);
    if (!change || !test) {
      throw new Error('Change or test not found');
    }

    const rule = parseAutomodRuleDraft(change.yaml, DEFAULT_AUTOMOD_RULE);
    const post = buildSimulationPost(test.post, test.id, test.label);
    const result = evaluateRule(rule, [post]);

    const item = result.items[0];
    if (!item) {
      throw new Error('No result item found');
    }

    const cell: MatrixCell = {
      changeId,
      testId,
      outcome: item.outcome,
      matchedCondition: result.matched > 0 ? `${rule.name} matched` : '',
      reason: item.reason,
      runAt: Date.now(),
    };

    saveMatrixCell(cell);
    return cell;
  };

  const handleRunAll = async () => {
    for (const change of changes) {
      for (const test of mockTests) {
        await handleRunMatrixCell(change.id, test.id);
      }
    }
  };

  const handleHistoryRestore = (yaml: string) => {
    handleApplyYaml(yaml, 'restore');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Topbar */}
      <PageTopbar
        ruleName={rule.name}
        action={rule.action}
        saving={saving}
        onReset={handleReset}
        onActionChange={handleActionChange}
        onOpenHistory={() => setHistoryPanelOpen(true)}
      />

      {/* Mode Tab Strip */}
      <ModeTabStrip mode={mode} setMode={setMode} />

      {/* Three-column workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 overflow-auto p-4 md:p-6 bg-[#16121F]">
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {!loading && (
            <>
              {mode === 'code' && (
                <div className="h-full flex flex-col">
                  <Textarea
                    value={draft}
                    onChange={(event) => handleDraftChange(event.target.value)}
                    className="flex-1 min-h-0 font-mono text-sm"
                  />
                  <div className="flex items-center justify-between mt-2 text-xs text-[--muted-foreground]">
                    <span>Editing the YAML draft updates the shared rule state immediately.</span>
                    <span>{draft.split('\n').length} lines</span>
                  </div>
                </div>
              )}

              {mode === 'debug' && (
                <DebuggerMode onApplyYaml={handleApplyYaml} onTestSaved={handleTestSaved} />
              )}

              {mode === 'chat' && (
                <div className="h-full flex flex-col bg-[#1E192B]">
                  <ChatMode
                    ast={[]}
                    messages={chatMessages}
                    onAddMessage={handleAddChatMessage}
                    onApplyAST={() => {}}
                    onApplyYaml={(yaml) => handleApplyYaml(yaml, 'chat')}
                    subredditName={init?.subredditName}
                    contextYaml={draft}
                  />
                </div>
              )}

              {mode === 'test-matrix' && (
                <TestMatrixView
                  changes={changes}
                  mockTests={mockTests}
                  onRunCell={handleRunMatrixCell}
                  onRunAll={handleRunAll}
                />
              )}
            </>
          )}
        </div>

        {/* Right Panel */}
        <RightPanel
          blast={blast}
          blasting={blasting}
          saving={saving}
          onRunBlast={() => void refreshBlast(rule)}
        />
      </div>

      {/* History Panel */}
      <HistoryPanel
        open={historyPanelOpen}
        snapshots={changes}
        currentYaml={draft}
        ruleCount={rule.conditions.length}
        onRestore={handleHistoryRestore}
        onSnapshotsChange={setChanges}
        onOpenChange={setHistoryPanelOpen}
      />
    </div>
  );
}