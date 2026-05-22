import { useInit } from '../contexts/init-context';
import ChatMode from '../components/ChatMode';
import DecoderMode from '../components/DecoderMode';
import EscapeHatchMode from '../components/EscapeHatchMode';
import DebuggerMode from '../components/DebuggerMode';
import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
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

export function RuleStagePage() {
  const { init } = useInit();
  const [mode, setMode] = useState<RuleStageMode>('code');
  const [rule, setRule] = useState<AutomodRule>(DEFAULT_AUTOMOD_RULE);
  const [draft, setDraft] = useState(() => serializeAutomodRule(DEFAULT_AUTOMOD_RULE));
  const [simulation, setSimulation] = useState(() => evaluateRule(DEFAULT_AUTOMOD_RULE, []));
  const [blast, setBlast] = useState<BlastRadiusResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError('Unable to load saved rule state.');
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
  }, []);

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
      setError('Unable to run the blast radius backtest.');
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
      setError('Unable to save the current rule.');
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
      setError('Unable to run the simulation.');
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
      setError(null);
    } catch (resetError) {
      console.error('RuleStage reset failed:', resetError);
      setError('Unable to reset RuleStage state.');
    }
  };

  const runSimulation = () => {
    void handleSimulation();
  };

  return (
    <div className="min-h-screen bg-[#F4F2F7] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-6">
        <header className="grid gap-4 rounded-[20px] border border-white/10 bg-white/6 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl md:grid-cols-[1.4fr_1fr] md:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15">RuleStage</Badge>
              <Badge className="bg-white/10 text-white hover:bg-white/10">Automod builder</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                Build, test, and stage Automod rules without leaving Reddit.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                All three modes write into the same rule state.
                The simulation panel shows exactly what would happen before anything is deployed.
              </p>
            </div>
          </div>

          <Card className="border-white/10 bg-slate-950/60 p-4 text-slate-100 shadow-none rounded-[20px]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Current rule</p>
                <p className="text-lg font-medium">{rule.name}</p>
              </div>
              <Badge className="bg-orange-400/15 text-orange-200 hover:bg-orange-400/15">{rule.action}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-slate-400">Matches</p>
                  <p className="font-medium">{simulation.matched} / {simulation.items.length}</p>
              </div>
            </div>
          </Card>
        </header>

        <nav className="rounded-[20px] border border-white/10 bg-white/6 p-2 backdrop-blur-xl">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(Object.keys(modeMeta) as RuleStageMode[]).map((item) => (
              <Button
                key={item}
                variant={mode === item ? 'default' : 'ghost'}
                className={cn(
                  'shrink-0 rounded-full px-5 py-2 text-sm',
                  mode === item ? 'bg-white text-slate-950 hover:bg-slate-100' : 'text-slate-200 hover:bg-white/8 hover:text-white'
                )}
                onClick={() => setMode(item)}
              >
                {modeMeta[item].label}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="rounded-full text-slate-200 hover:bg-white/8 hover:text-white"
              onClick={() => {
                void handleReset();
              }}
            >
              Reset rule
            </Button>
            <Button
              className="rounded-full bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300"
              onClick={runSimulation}
            >
              Run Simulation
            </Button>
            <Button
              className="rounded-full bg-sky-400 px-5 text-slate-950 hover:bg-sky-300"
              onClick={() => {
                void refreshBlast(rule);
              }}
            >
              {blasting ? 'Running Blast...' : 'Run Blast Radius'}
            </Button>
          </div>
        </nav>

        {error && (
          <Card className="border-amber-300/20 bg-amber-400/10 p-4 text-amber-100 shadow-none rounded-[20px]">
            <p className="text-sm">{error}</p>
          </Card>
        )}

        {loading && (
          <Card className="border-white/10 bg-white/6 p-4 text-slate-200 shadow-none rounded-[20px]">
            <p className="text-sm">Loading saved rule state...</p>
          </Card>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="overflow-hidden border-white/10 bg-slate-950/55 p-0 text-slate-100 shadow-none rounded-[20px]">
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-sm font-medium text-white">{modeMeta[mode].label} Mode</p>
              <p className="text-sm text-slate-400">{modeMeta[mode].helper}</p>
            </div>

            {mode === 'code' && (
              <div className="grid gap-4 p-5">
                <Textarea
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  className="min-h-128 rounded-[1.35rem] border-white/10 bg-slate-900/90 font-mono text-sm text-slate-100 shadow-inner shadow-black/20 focus-visible:ring-emerald-400/40"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Editing the YAML draft updates the shared rule state immediately.</span>
                </div>
              </div>
            )}

            {mode === 'debug' && (
              <div className="p-5">
                <DebuggerMode onApplyYaml={handleApplyYaml} />
              </div>
            )}

            {mode === 'drag' && (
              <div className="grid gap-4 p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Trigger</p>
                    <p className="mt-2 text-lg font-medium">{rule.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{describeCondition(rule.conditions[0] ?? DEFAULT_AUTOMOD_RULE.conditions[0])}</p>
                  </Card>
                  <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Audience</p>
                    <p className="mt-2 text-lg font-medium">New or low-karma accounts</p>
                    <p className="mt-1 text-sm text-slate-400">{describeCondition(rule.conditions[1] ?? DEFAULT_AUTOMOD_RULE.conditions[1])}</p>
                    <p className="mt-1 text-sm text-slate-400">{describeCondition(rule.conditions[2] ?? DEFAULT_AUTOMOD_RULE.conditions[2])}</p>
                  </Card>
                  <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Action</p>
                    <p className="mt-2 text-lg font-medium">{rule.action}</p>
                    <p className="mt-1 text-sm text-slate-400">Comment stickied: {rule.commentStickied ? 'yes' : 'no'}</p>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                    <p className="text-sm font-medium">Title phrases</p>
                    <p className="mt-1 text-sm text-slate-400">Edit the phrase list to widen or narrow the match.</p>
                    <Textarea
                      value={rule.conditions[0]?.value ?? ''}
                      onChange={(event) => {
                        const nextRule = updateConditionValue(rule, 'title', event.target.value);
                        setRule(nextRule);
                        setDraft(serializeAutomodRule(nextRule));
                      }}
                      className="mt-3 min-h-28 rounded-2xl border-white/10 bg-slate-900/80 text-slate-100"
                    />
                  </Card>

                  <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                    <p className="text-sm font-medium">Thresholds</p>
                    <p className="mt-1 text-sm text-slate-400">Adjust the account age and karma gates.</p>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-2 text-sm text-slate-300">
                        Account age
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400"
                          value={rule.conditions[1]?.value ?? ''}
                          onChange={(event) => {
                            const nextRule = updateConditionValue(rule, 'account_age', event.target.value);
                            setRule(nextRule);
                            setDraft(serializeAutomodRule(nextRule));
                          }}
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-slate-300">
                        Combined karma
                        <input
                          className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-400"
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

                <Card className="border-white/10 bg-white/5 p-4 rounded-[20px]">
                  <p className="text-sm font-medium">Action mode</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['remove', 'report', 'approve'] as AutomodAction[]).map((action) => (
                      <Button
                        key={action}
                        variant={rule.action === action ? 'default' : 'outline'}
                        className={cn(
                          'rounded-full',
                          rule.action === action
                            ? 'bg-white text-slate-950 hover:bg-slate-100'
                            : 'border-white/15 bg-transparent text-slate-200 hover:bg-white/8 hover:text-white'
                        )}
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
              <div className="p-5">
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
              <div className="p-5">
                <DecoderMode onApplyYaml={handleApplyYaml} geminiApiKey={geminiApiKey} />
              </div>
            )}

            {mode === 'escape-hatch' && (
              <div className="p-5">
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
              </div>
            )}
          </Card>

          <aside className="grid gap-4">
            <Card className="border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-none rounded-[20px]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Simulation summary</p>
                <Badge className="bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15">Dry run</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-400">{saving ? 'Saving rule...' : 'Simulation state is saved.'}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-slate-400">Removed</p>
                  <p className="text-2xl font-semibold">{simulation.removed}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-slate-400">Approved</p>
                  <p className="text-2xl font-semibold">{simulation.approved}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-slate-400">Reported</p>
                  <p className="text-2xl font-semibold">{simulation.reported}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <p className="text-slate-400">Matched</p>
                  <p className="text-2xl font-semibold">{simulation.matched}</p>
                </div>
              </div>
            </Card>

            <Card className="border-white/10 bg-white/6 p-4 text-slate-100 shadow-none rounded-[20px]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Blast Radius</p>
                <Badge className="bg-sky-400/15 text-sky-200 hover:bg-sky-400/15">Backtest</Badge>
              </div>
              {blast ? (
                <div className="mt-4 space-y-3 text-sm text-slate-200">
                  <p>Tested against {blast.totalTested} cached posts.</p>
                  <p>Would have caught {blast.wouldCatch} spam posts.</p>
                  {blast.falsePositives.length > 0 ? (
                    <div className="space-y-2">
                      <p>False positives:</p>
                      <ul className="space-y-1 pl-4 text-slate-300">
                        {blast.falsePositives.slice(0, 3).map((post) => (
                          <li key={post.id}>- {post.title} (u/{post.author})</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>No false positives detected.</p>
                  )}
                  <p>Missed spam: {blast.missedSpam.length}</p>
                  <p>Catch rate: {(blast.catchRate * 100).toFixed(0)}% | False positive rate: {(blast.falsePositiveRate * 100).toFixed(0)}%</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Run the blast radius backtest to see false positives and missed spam.</p>
              )}
            </Card>

            <Card className="border-white/10 bg-white/6 p-4 text-slate-100 shadow-none rounded-[20px]">
              <p className="text-sm font-medium">Recent dry-run items</p>
              <div className="mt-4 space-y-3">
                {simulation.items.length === 0 ? (
                  <p className="text-sm text-slate-400">No simulation items yet. Run a simulation after loading posts.</p>
                ) : (
                  simulation.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-slate-400">u/{item.author}</p>
                        </div>
                        <Badge className={cn(
                          item.outcome === 'remove'
                            ? 'bg-red-400/15 text-red-200 hover:bg-red-400/15'
                            : item.outcome === 'report'
                              ? 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/15'
                              : 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15'
                        )}>
                          {item.outcome}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  );
}