import { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import type { DecoderAnalysis } from '../../shared/automod';

interface DecoderModeProps {
  onApplyYaml: (yaml: string) => void;
  geminiApiKey: string;
}

type HighlightToken = {
  text: string;
  className: string;
};

function tokenizeRegex(pattern: string): HighlightToken[] {
  const tokens = pattern.match(/\\.|\[.*?\]|\(\?:|\(\?=|\(\?!|[()[\]{}|^$+*?]|[^()[\]{}|^$+*?\\]+/g) ?? [pattern];

  return tokens.map((token) => {
    if (token === '|' || token === '^' || token === '$') {
      return { text: token, className: 'text-amber-300' };
    }

    if (token === '(' || token === ')' || token === '(?:' || token === '(?=' || token === '(?!') {
      return { text: token, className: 'text-fuchsia-300' };
    }

    if (token === '+' || token === '*' || token === '?' || token === '{' || token === '}') {
      return { text: token, className: 'text-rose-300' };
    }

    if (token.startsWith('[') && token.endsWith(']')) {
      return { text: token, className: 'text-sky-300' };
    }

    if (token.startsWith('\\')) {
      return { text: token, className: 'text-emerald-300' };
    }

    return { text: token, className: 'text-slate-100' };
  });
}

function confidenceStyles(confidence: DecoderAnalysis['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-[--success]/15 text-[--success] border-[--success]/25';
    case 'medium':
      return 'bg-[--warning]/15 text-[--warning] border-[--warning]/25';
    default:
      return 'bg-[--danger]/15 text-[--danger] border-[--danger]/25';
  }
}

export default function DecoderMode({ onApplyYaml, geminiApiKey }: DecoderModeProps) {
  const [examples, setExamples] = useState(['', '', '']);
  const [activeTab, setActiveTab] = useState(0);
  const [analysis, setAnalysis] = useState<DecoderAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRegex, setCopiedRegex] = useState(false);
  const [appliedPattern, setAppliedPattern] = useState<string | null>(null);

  const canAnalyze = examples.every((example) => example.trim().length > 0) && !loading;

  const updateExample = (index: number, value: string) => {
    setExamples((current) => current.map((example, itemIndex) => (itemIndex === index ? value : example)));
  };

  const handleAnalyze = async () => {
    if (!canAnalyze) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/rule-stage/decoder/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ examples: [examples[0], examples[1], examples[2]] }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze obfuscation');
      }

      const data = (await response.json()) as { status: 'success'; analysis: DecoderAnalysis };
      setAnalysis(data.analysis);
    } catch (analysisError) {
      console.error('Decoder analysis failed:', analysisError);
      setError((analysisError as Error).message || 'Failed to analyze obfuscation.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRegex = async () => {
    if (!analysis) {
      return;
    }

    try {
      await navigator.clipboard.writeText(analysis.regexPattern);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = analysis.regexPattern;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      document.body.removeChild(helper);
    }

    setCopiedRegex(true);
    setTimeout(() => setCopiedRegex(false), 2000);
  };

  const handleApplyYaml = () => {
    if (!analysis) {
      return;
    }

    onApplyYaml(analysis.automodYaml);
    setAppliedPattern(analysis.regexPattern);
  };

  const apiKeyStatus = geminiApiKey
    ? 'Decoder runs server-side; the browser key is only needed for Chat mode.'
    : 'Decoder runs server-side; add a key only if you want to use Chat mode.';
  const appliedYaml = analysis ? appliedPattern === analysis.regexPattern : false;

  return (
    <div className="grid gap-4">
      <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
        <div className="space-y-1">
          <p className="text-sm font-medium">Paste three spam examples</p>
          <p className="text-sm text-[--muted-foreground]">The decoder looks for shared Unicode tricks and returns a regex plus AutoMod YAML.</p>
        </div>

        {/* Tabbed input interface */}
        <div className="mt-4">
          <div className="flex gap-1 border-b border-[--border] overflow-x-auto">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                  activeTab === index
                    ? 'text-[--foreground] border-b-2 border-[--primary]'
                    : 'text-[--muted-foreground] hover:text-[--foreground]'
                }`}
              >
                Example {index + 1}
                {examples[index] && (
                  <span className="ml-2 text-[10px] bg-[--success]/15 text-[--success] px-1.5 py-0.5 rounded">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Textarea
              value={examples[activeTab]}
              onChange={(event) => updateExample(activeTab, event.target.value)}
              placeholder="Paste a spam message that slipped through…"
              className="min-h-32"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90 disabled:cursor-not-allowed disabled:bg-[--surface-3] disabled:text-[--muted-foreground]"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-[--muted-foreground]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[--success]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[--success] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[--success] [animation-delay:240ms]" />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-[--muted-foreground]">{apiKeyStatus}</p>
      </Card>

      {error && (
        <div className="rounded-lg border border-[--danger]/30 bg-[--danger]/15 p-3 text-xs text-[--danger]">
          Error: {error}
        </div>
      )}

      {analysis && (
        <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Decoder result</p>
              <p className="text-sm text-[--muted-foreground]">A shared explanation, regex pattern, and ready-to-apply YAML snippet.</p>
            </div>
            <Badge variant="outline" className={confidenceStyles(analysis.confidence)}>{analysis.confidence}</Badge>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {analysis.tricks.map((trick) => (
              <Badge key={trick} variant="outline" className="bg-[--surface-3] text-[--foreground] border-[--border]">
                {trick}
              </Badge>
            ))}
          </div>

          <details className="mt-4 rounded-lg border border-[--border] bg-[--surface-3] p-4">
            <summary className="cursor-pointer text-sm font-medium text-[--foreground]">Explanation</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[--muted-foreground]">{analysis.explanation}</p>
          </details>

          <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3]">
            <div className="flex items-center justify-between gap-3 border-b border-[--border] px-4 py-3">
              <div>
                <p className="text-sm font-medium">Regex pattern</p>
                <p className="text-xs text-[--muted-foreground]">Copy this pattern into Code Mode or use it in AutoMod.</p>
              </div>
              <Button
                variant="ghost"
                onClick={handleCopyRegex}
                className="text-[--muted-foreground] hover:bg-[--surface-2] hover:text-[--foreground]"
              >
                {copiedRegex ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="overflow-auto px-4 py-3 font-mono text-sm leading-6">
              {tokenizeRegex(analysis.regexPattern).map((token, index) => (
                <span key={index} className={token.className}>
                  {token.text}
                </span>
              ))}
            </pre>
          </div>

          <div className="mt-4 rounded-lg border border-[--border] bg-[--surface-3] overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[--border] px-4 py-3">
              <div>
                <p className="text-sm font-medium">AutoMod YAML</p>
                <p className="text-xs text-[--muted-foreground]">Apply the generated rule directly to the shared rule state.</p>
              </div>
              <Button
                onClick={handleApplyYaml}
                className="bg-[--info] text-[--foreground] hover:bg-[--info]/90"
              >
                {appliedYaml ? 'Applied' : 'Apply to Rules'}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto bg-[--surface-2] px-4 py-3 font-mono text-xs leading-6 text-[--success]">
              {analysis.automodYaml}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}