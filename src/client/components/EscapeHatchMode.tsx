import { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { AlertTriangle } from 'lucide-react';
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
      return 'bg-[--success]/15 text-[--success] border-[--success]/25';
    case 'medium':
      return 'bg-[--warning]/15 text-[--warning] border-[--warning]/25';
    default:
      return 'bg-[--danger]/15 text-[--danger] border-[--danger]/25';
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
      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-[--warning]/15 border border-[--warning]/25">
        <AlertTriangle className="w-5 h-5 text-[--warning] shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-[--foreground]">Advanced Mode</p>
          <p className="text-sm text-[--muted-foreground] mt-1">
            This mode generates custom TypeScript triggers for complex moderation needs that AutoMod YAML cannot handle. Use this only when standard YAML rules are insufficient.
          </p>
        </div>
      </div>

      <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
        <div className="space-y-1">
          <p className="text-sm font-medium">Describe the moderation requirement</p>
          <p className="text-sm text-[--muted-foreground]">If YAML cannot handle it, the analyzer will generate a TypeScript trigger and installation steps.</p>
        </div>

        <Textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Check a database list before removing a post, parse JSON from the body, call an external API, and so on."
          className="mt-4 min-h-28"
          disabled={busy}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleAnalyze}
            disabled={busy || !request.trim()}
            className="bg-[--warning] text-[--foreground] hover:bg-[--warning]/90 disabled:cursor-not-allowed disabled:bg-[--surface-3] disabled:text-[--muted-foreground]"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </Button>
          <p className="text-xs text-[--muted-foreground]">This stays inside RuleStage and reuses the same server analysis flow as the other builder modes.</p>
        </div>
      </Card>

      {error && (
        <Card className="border-[--danger]/30 bg-[--danger]/15 p-3 text-sm text-[--danger]">
          {error}
        </Card>
      )}

      {result && (
        <div className="grid gap-4">
          <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Limitation analysis</p>
                <p className="text-sm text-[--muted-foreground]">{result.limitation.explanation}</p>
              </div>
              <Badge variant="outline" className={result.limitation.recommendation === 'typescript' ? 'bg-[--warning]/15 text-[--warning] border-[--warning]/25' : 'bg-[--success]/15 text-[--success] border-[--success]/25'}>
                {result.limitation.recommendation}
              </Badge>
            </div>

            <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[--muted-foreground]">Outcome</p>
              <p className="mt-2 text-sm text-[--foreground]">
                {result.limitation.hasLimitation
                  ? 'AutoModerator cannot handle this natively. A custom TypeScript trigger was generated below.'
                  : 'AutoModerator can handle this natively. Keep the rule in YAML.'}
              </p>
            </div>
          </Card>

          {result.escapeHatch ? (
            <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Generated TypeScript trigger</p>
                  <p className="text-sm text-[--muted-foreground]">{result.escapeHatch.description}</p>
                </div>
                <Badge variant="outline" className={confidenceClass(result.escapeHatch.confidence)}>{result.escapeHatch.confidence} confidence</Badge>
              </div>

              <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3]">
                <div className="flex items-center justify-between gap-3 border-b border-[--border] px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-[--muted-foreground]">onPostSubmit trigger</p>
                  <Button variant="ghost" onClick={handleCopy} className="text-[--muted-foreground] hover:bg-[--surface-2] hover:text-[--foreground]">
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-6 text-[--foreground]">
                  {result.escapeHatch.triggerCode}
                </pre>
              </div>

              {result.escapeHatch.limitations.length > 0 && (
                <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3] p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-[--muted-foreground]">Limitations</p>
                  <ul className="mt-2 space-y-1 text-sm text-[--foreground]">
                    {result.escapeHatch.limitations.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-[--muted-foreground]">Installation steps</p>
                <ol className="mt-2 space-y-2 text-sm text-[--foreground]">
                  {result.escapeHatch.installationSteps.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[--primary] text-[--primary-foreground] text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ) : (
            <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
              <p className="text-sm font-medium">No escape hatch needed</p>
              <p className="mt-2 text-sm text-[--muted-foreground]">The request can stay in AutoModerator YAML, so there is no custom trigger to generate.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}