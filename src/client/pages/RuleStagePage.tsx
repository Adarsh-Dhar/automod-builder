import { useInit } from '../contexts/init-context';
import ChatMode from '../components/ChatMode';
import DecoderMode from '../components/DecoderMode';
import EscapeHatchMode from '../components/EscapeHatchMode';
import DebuggerMode from '../components/DebuggerMode';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { useToast } from '../hooks/use-toast';
import { PageTopbar } from '../components/layout/PageTopbar';
import { ModeTabStrip } from '../components/layout/ModeTabStrip';
import { RightPanel } from '../components/layout/RightPanel';
import {
  DEFAULT_AUTOMOD_RULE,
  describeCondition,
  evaluateRule,
  parseAutomodRuleDraft,
  serializeAutomodRule,
  type AutomodAction,
  type AutomodCondition,
  type AutomodRule,
  type RuleStageMode,
} from '../../shared/automod';
import type { BlastRadiusResult } from '../../shared/blast-types';

type RuleStageInitResponse = {
  status: 'success';
  rule: AutomodRule;
  simulation: ReturnType<typeof evaluateRule>;
};

const modeMeta: Record<RuleStageMode, { label: string; helper: string }> = {
  code: { label: 'Code', helper: 'Edit raw YAML and keep the rule source of truth in sync.' },
  drag: { label: 'Drag', helper: 'Tweak the rule as blocks and thresholds without leaving the builder.' },
  chat: { label: 'Chat', helper: 'Ask for a rule rewrite and apply the AI suggestion to the same rule.' },
  decoder: { label: 'Decoder', helper: 'Feed 3 spam examples; get a Regex that traps the campaign.' },
  'escape-hatch': { label: 'Escape Hatch', helper: 'When AutoMod cannot handle it, generate a custom TypeScript trigger.' },
  debug: { label: 'Debugger', helper: 'Inspect a specific post and get suggested YAML fixes.' },
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

function updateCondition(rule: AutomodRule, field: AutomodCondition['field'], patch: Partial<AutomodCondition>): AutomodRule {
  const next = cloneRule(rule);
  const target = next.conditions.find((condition) => condition.field === field);

  if (target) {
    Object.assign(target, patch);
  }

  return next;
}

function updateConditionValue(rule: AutomodRule, field: AutomodCondition['field'], value: string): AutomodRule {
  return updateCondition(rule, field, { value });
}

function getConditionSafely(rule: AutomodRule, index: number): AutomodCondition {
  const fallback: AutomodCondition = {
    field: 'title',
    operator: 'contains',
    value: '',
  };
  return (rule.conditions[index] || DEFAULT_AUTOMOD_RULE.conditions[index] || fallback) as AutomodCondition;
}

export function RuleStagePage() {
  const { init } = useInit();
  const { toast } = useToast();
  const [mode, setMode] = useState<RuleStageMode>('code');
  const [rule, setRule] = useState<AutomodRule>(DEFAULT_AUTOMOD_RULE);
  const [draft, setDraft] = useState(() => serializeAutomodRule(DEFAULT_AUTOMOD_RULE));
  const [simulation, setSimulation] = useState(() => evaluateRule(DEFAULT_AUTOMOD_RULE, []));
  const [blast, setBlast] = useState<BlastRadiusResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blasting, setBlasting] = useState(false);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        setLoading(true);
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
        setSimulation(data.simulation);
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

  const handleApplyYaml = (yaml: string) => {
    const parsed = parseAutomodRuleDraft(yaml, rule);
    setRule(parsed);
    setDraft(serializeAutomodRule(parsed));
    setMode('code');
    void persistRule(parsed);
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

    const parsed = parseAutomodRuleDraft(value, rule);
    setRule(parsed);
    void persistRule(parsed);
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

  const handleActionChange = (action: AutomodAction) => {
    const nextRule = cloneRule(rule);
    nextRule.action = action;
    setRule(nextRule);
    setDraft(serializeAutomodRule(nextRule));
    void persistRule(nextRule);
  };

  const handleSimulation = async () => {
    try {
      const response = await fetch('/api/rule-stage/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rule }),
      });

      if (!response.ok) {
        throw new Error('Failed to run simulation');
      }

      const data = (await response.json()) as { status: 'success'; simulation: ReturnType<typeof evaluateRule> };
      setSimulation(data.simulation);
    } catch (simulateError) {
      console.error('RuleStage simulation failed:', simulateError);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to run the simulation.',
      });
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
      setSimulation(data.simulation);
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

  const runSimulation = () => {
    void handleSimulation();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Topbar */}
      <PageTopbar
        ruleName={rule.name}
        action={rule.action}
        saving={saving}
        yaml={draft}
        ruleCount={1}
        onReset={handleReset}
        onActionChange={handleActionChange}
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
                <DebuggerMode onApplyYaml={handleApplyYaml} />
              )}

              {mode === 'drag' && (
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Card className="p-4 border-l-4 border-l-[--primary]">
                      <p className="text-xs uppercase tracking-[0.24em] text-[--muted-foreground]">Trigger</p>
                      <p className="mt-2 text-lg font-medium text-[--foreground]">{rule.name || 'No trigger set'}</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">{describeCondition(getConditionSafely(rule, 0))}</p>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-[--info]">
                      <p className="text-xs uppercase tracking-[0.24em] text-[--muted-foreground]">Audience</p>
                      <p className="mt-2 text-lg font-medium text-[--foreground]">New or low-karma accounts</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">{describeCondition(getConditionSafely(rule, 1))}</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">{describeCondition(getConditionSafely(rule, 2))}</p>
                    </Card>
                    <Card className="p-4 border-l-4 border-l-[--warning]">
                      <p className="text-xs uppercase tracking-[0.24em] text-[--muted-foreground]">Action</p>
                      <p className="mt-2 text-lg font-medium text-[--foreground]">{rule.action}</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">Comment stickied: {rule.commentStickied ? 'yes' : 'no'}</p>
                    </Card>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="p-4 border-l-4 border-l-[--success]">
                      <p className="text-sm font-medium text-[--foreground]">Title phrases</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">Edit the phrase list to widen or narrow the match.</p>
                      <Textarea
                        value={rule.conditions[0]?.value ?? ''}
                        onChange={(event) => {
                          const nextRule = updateConditionValue(rule, 'title', event.target.value);
                          setRule(nextRule);
                          setDraft(serializeAutomodRule(nextRule));
                        }}
                        className="mt-3 min-h-28"
                      />
                    </Card>

                    <Card className="p-4 border-l-4 border-l-[--danger]">
                      <p className="text-sm font-medium text-[--foreground]">Thresholds</p>
                      <p className="mt-1 text-sm text-[--muted-foreground]">Adjust the account age and karma gates.</p>
                      <div className="mt-3 grid gap-3">
                        <label className="grid gap-2 text-sm text-[--foreground]">
                          Account age
                          <input
                            className="rounded-[--radius] border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none transition focus:border-[--primary]"
                            value={rule.conditions[1]?.value ?? ''}
                            onChange={(event) => {
                              const nextRule = updateConditionValue(rule, 'account_age', event.target.value);
                              setRule(nextRule);
                              setDraft(serializeAutomodRule(nextRule));
                            }}
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-[--foreground]">
                          Combined karma
                          <input
                            className="rounded-[--radius] border border-[--border] bg-[--surface-3] px-3 py-2 text-[--foreground] outline-none transition focus:border-[--primary]"
                            value={rule.conditions[2]?.value ?? ''}
                            onChange={(event) => {
                              const nextRule = updateConditionValue(rule, 'combined_karma', event.target.value);
                              setRule(nextRule);
                              setDraft(serializeAutomodRule(nextRule));
                            }}
                          />
                        </label>
                      </div>
                    </Card>
                  </div>

                  <Card className="p-4 border-l-4 border-l-[--primary]">
                    <p className="text-sm font-medium text-[--foreground]">Action mode</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(['remove', 'report', 'approve'] as AutomodAction[]).map((action) => (
                        <Button
                          key={action}
                          variant={rule.action === action ? 'default' : 'outline'}
                          onClick={() => handleActionChange(action)}
                        >
                          {action}
                        </Button>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {mode === 'chat' && (
                <div className="h-full flex flex-col bg-[#1E192B]">
                  <ChatMode
                    ast={[]}
                    messages={chatMessages}
                    onAddMessage={handleAddChatMessage}
                    onApplyAST={() => {}}
                    onApplyYaml={handleApplyYaml}
                    subredditName={init?.subredditName}
                    contextYaml={draft}
                  />
                </div>
              )}

              {mode === 'decoder' && (
                <DecoderMode onApplyYaml={handleApplyYaml} geminiApiKey="" />
              )}

              {mode === 'escape-hatch' && (
                <EscapeHatchMode
                  loading={loading}
                  onAnalyze={async (request: string) => {
                    const response = await fetch('/api/rule-stage/escape-hatch/analyze', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ request }),
                    });

                    if (!response.ok) {
                      throw new Error('Failed to analyze request');
                    }

                    return (await response.json()) as {
                      status: 'success';
                      limitation: {
                        hasLimitation: boolean;
                        limitation: string | null;
                        explanation: string;
                        recommendation: 'yaml' | 'typescript';
                      };
                      escapeHatch: {
                        triggerCode: string;
                        description: string;
                        limitations: string[];
                        installationSteps: string[];
                        confidence: 'high' | 'medium' | 'low';
                      } | null;
                    };
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Right Panel */}
        <RightPanel
          simulation={{
            removed: simulation.removed,
            approved: simulation.approved,
            reported: simulation.reported,
            matched: simulation.matched,
            items: simulation.items.map((item) => ({
              id: item.id,
              title: item.title,
              author: item.author,
              outcome: item.outcome,
              reason: item.reason,
            })),
          }}
          blast={blast}
          blasting={blasting}
          saving={saving}
          onRunSimulation={runSimulation}
          onRunBlast={() => void refreshBlast(rule)}
        />
      </div>
    </div>
  );
}