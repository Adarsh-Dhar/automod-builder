import { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import type { EscapeHatchCode, YamlLimitationAnalysis } from '../../shared/automod';

type AnalysisResult = {
  status: 'success';
  limitation: YamlLimitationAnalysis;
  escapeHatch: EscapeHatchCode | null;
};

interface EscapeHatchModeProps {
  onAnalyze: (request: string) => Promise<AnalysisResult>;
  loading: boolean;
}

function confidenceClass(confidence: EscapeHatchCode['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15';
    case 'medium':
      return 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/15';
    default:
      return 'bg-red-400/15 text-red-200 hover:bg-red-400/15';
  }
}

export default function EscapeHatchMode({ onAnalyze, loading }: EscapeHatchModeProps) {
  const [request, setRequest] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    const trimmed = request.trim();

    if (!trimmed) {
      setError('Describe the moderation requirement first.');
      return;
    }

    try {
      setAnalyzing(true);
      setError(null);
      setCopied(false);
      const response = await onAnalyze(trimmed);
      setResult(response);
    } catch (analysisError) {
      console.error('Escape hatch analysis failed:', analysisError);
      setError(analysisError instanceof Error ? analysisError.message : 'Failed to analyze request.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopy = async () => {
    const code = result?.escapeHatch?.triggerCode;

    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = code;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      document.body.removeChild(helper);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const busy = loading || analyzing;

  return (
    <div className="grid gap-4">
      <Card className="border-white/10 bg-white/5 p-4 text-slate-100 shadow-none">
        <div className="space-y-1">
          <p className="text-sm font-medium">Describe the moderation requirement</p>
          <p className="text-sm text-slate-400">If YAML cannot handle it, the analyzer will generate a TypeScript trigger and installation steps.</p>
        </div>

        <Textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Check a database list before removing a post, parse JSON from the body, call an external API, and so on."
          className="mt-4 min-h-28 rounded-2xl border-white/10 bg-slate-900/80 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-400/30"
          disabled={busy}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleAnalyze}
            disabled={busy || !request.trim()}
            className="rounded-full bg-orange-400 px-5 text-slate-950 hover:bg-orange-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </Button>
          <p className="text-xs text-slate-400">This stays inside RuleStage and reuses the same server analysis flow as the other builder modes.</p>
        </div>
      </Card>

      {error && (
        <Card className="border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200 shadow-none">
          {error}
        </Card>
      )}

      {result && (
        <div className="grid gap-4">
          <Card className="border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Limitation analysis</p>
                <p className="text-sm text-slate-400">{result.limitation.explanation}</p>
              </div>
              <Badge className={result.limitation.recommendation === 'typescript' ? 'bg-orange-400/15 text-orange-200 hover:bg-orange-400/15' : 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15'}>
                {result.limitation.recommendation}
              </Badge>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Outcome</p>
              <p className="mt-2 text-sm text-slate-200">
                {result.limitation.hasLimitation
                  ? 'AutoModerator cannot handle this natively. A custom TypeScript trigger was generated below.'
                  : 'AutoModerator can handle this natively. Keep the rule in YAML.'}
              </p>
            </div>
          </Card>

          {result.escapeHatch ? (
            <Card className="border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Generated TypeScript trigger</p>
                  <p className="text-sm text-slate-400">{result.escapeHatch.description}</p>
                </div>
                <Badge className={confidenceClass(result.escapeHatch.confidence)}>{result.escapeHatch.confidence} confidence</Badge>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">onPostSubmit trigger</p>
                  <Button variant="ghost" onClick={handleCopy} className="rounded-full text-slate-200 hover:bg-white/8 hover:text-white">
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-6 text-slate-200">
                  {result.escapeHatch.triggerCode}
                </pre>
              </div>

              {result.escapeHatch.limitations.length > 0 && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Limitations</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-300">
                    {result.escapeHatch.limitations.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Installation steps</p>
                <ol className="mt-2 space-y-1 text-sm text-slate-300">
                  {result.escapeHatch.installationSteps.map((step, index) => (
                    <li key={`${index}-${step}`}>{index + 1}. {step}</li>
                  ))}
                </ol>
              </div>
            </Card>
          ) : (
            <Card className="border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-none">
              <p className="text-sm font-medium">No escape hatch needed</p>
              <p className="mt-2 text-sm text-slate-400">The request can stay in AutoModerator YAML, so there is no custom trigger to generate.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}