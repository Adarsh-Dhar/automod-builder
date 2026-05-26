import { useInit } from '../contexts/init-context';
import ChatMode from '../components/ChatMode';
import DebuggerMode from '../components/DebuggerMode';
import HistoryPanel from '../components/HistoryPanel';
import { useEffect, useState, useRef } from 'react';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { useToast } from '../hooks/use-toast';
import { PageTopbar } from '../components/layout/PageTopbar';
import { Sidebar } from '../components/layout/Sidebar';
import { RightPanel } from '../components/layout/RightPanel';
import {
  DEFAULT_AUTOMOD_RULE,
  extractFirstRule,
  hasMultipleRules,
  parseAutomodRuleDraft,
  serializeAutomodRule,
  type AutomodRule,
  type RuleStageMode,
} from '../../shared/automod';
import type { BlastRadiusResult } from '../../shared/blast-types';
import { getSnapshots, saveSnapshot, type HistorySnapshot } from '../utils/history';
import WikiRevisionsPanel from '../components/WikiRevisionsPanel';

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
  const [changes, setChanges] = useState<HistorySnapshot[]>(getSnapshots());
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
              // Auto-sync blast cache after rule loads
              await syncBlastCache();
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
        // Auto-sync blast cache after rule loads
        await syncBlastCache();
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

  const handleApplyYaml = (yaml: string, source?: HistorySnapshot['source']) => {
    // Generate meaningful title based on source
    const title = source === 'chat' 
      ? 'Added rules from AI chat'
      : source === 'debugger'
      ? 'Fixed rules via debugger'
      : source === 'restore'
      ? 'Restored rules from history'
      : source === 'decoder'
      ? 'Decoded and applied rules'
      : source === 'escape-hatch'
      ? 'Added escape hatch trigger'
      : 'Updated rules via code editor';

    // If YAML contains multiple rules, preserve all rules in the draft
    if (hasMultipleRules(yaml)) {
      setDraft(yaml);
      // Extract first rule for features that need single rule (blast radius, etc.)
      const firstRuleYaml = extractFirstRule(yaml);
      const parsed = parseAutomodRuleDraft(firstRuleYaml, rule);
      setRule(parsed);
      setMode('code');
      void persistRawYaml(yaml, title);
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
      void persistRule(parsed, title);
      // Save snapshot with source
      const updated = saveSnapshot(serializeAutomodRule(parsed), parsed.conditions.length, undefined, source);
      setChanges(updated);
    }
  };

  const refreshBlast = async (yaml: string) => {
    try {
      setBlasting(true);
      const response = await fetch('/api/rule-stage/blast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ yaml }),
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

  const syncBlastCache = async () => {
    try {
      const response = await fetch('/api/rule-stage/sync-blast-cache', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync blast cache');
      }

      const data = (await response.json()) as { status: string; synced: number; total: number };
      console.log(`[RuleStage] Synced ${data.synced} new posts. Total: ${data.total}`);
    } catch (syncError) {
      console.error('RuleStage sync-blast-cache failed:', syncError);
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

  const persistRule = async (nextRule: AutomodRule, title?: string) => {
    try {
      setSaving(true);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (init?.subredditName) {
        headers['x-reddit-subreddit'] = init.subredditName;
      }
      const response = await fetch('/api/rule-stage/rule', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...nextRule, title }),
      });

      if (!response.ok) {
        throw new Error('Failed to save rule');
      }

      await response.json();
      await refreshBlast(serializeAutomodRule(nextRule));
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

  const persistRawYaml = async (yaml: string, title?: string) => {
    try {
      setSaving(true);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (init?.subredditName) {
        headers['x-reddit-subreddit'] = init.subredditName;
      }
      const response = await fetch('/api/rule-stage/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ yaml, title }),
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

  const handleReset = async () => {
    try {
      const response = await fetch('/api/rule-stage/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to reset RuleStage state');
      }

      const data = (await response.json()) as RuleStageInitResponse;
      setRule(data.rule);
      setDraft(serializeAutomodRule(data.rule));
      await refreshBlast(serializeAutomodRule(data.rule));
    } catch (resetError) {
      console.error('RuleStage reset failed:', resetError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to reset RuleStage state.',
      });
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
        saving={saving}
        onReset={handleReset}
        onOpenHistory={() => setHistoryPanelOpen(true)}
      />

      {/* Sidebar - fixed positioned overlay */}
      <div className="fixed left-0 top-14 bottom-0 z-30">
        <Sidebar
          ruleName={rule.name}
          mode={mode}
          setMode={setMode}
        />
      </div>

      {/* Main workspace */}
      <div className="flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 overflow-auto p-6 md:p-8 bg-[var(--background)]">
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
                  <div className="flex items-center justify-between mt-2 text-xs text-[var(--muted-foreground)]">
                    <span>Editing the YAML draft updates the shared rule state immediately.</span>
                    <span>{draft.split('\n').length} lines</span>
                  </div>
                </div>
              )}

              {mode === 'debug' && (
                <DebuggerMode onApplyYaml={handleApplyYaml} />
              )}

              {mode === 'chat' && (
                <div className="h-full flex flex-col bg-[var(--background)]">
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

              {mode === 'wiki-history' && (
                <div className="h-full -m-4 md:-m-6">
                  <WikiRevisionsPanel
                    {...(init?.subredditName && { subredditName: init.subredditName })}
                    onRestore={handleHistoryRestore}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel */}
        <RightPanel
          blast={blast}
          blasting={blasting}
          saving={saving}
          onRunBlast={() => void refreshBlast(draft)}
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
