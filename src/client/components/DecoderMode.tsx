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
      return 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15';
    case 'medium':
      return 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/15';
    default:
      return 'bg-red-400/15 text-red-200 hover:bg-red-400/15';
  }
}

export default function DecoderMode({ onApplyYaml, geminiApiKey }: DecoderModeProps) {
  const [examples, setExamples] = useState(['', '', '']);
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
      <Card className="border-white/10 bg-white/5 p-4 text-slate-100 shadow-none">
        <div className="space-y-1">
          <p className="text-sm font-medium">Paste three spam examples</p>
          <p className="text-sm text-slate-400">The decoder looks for shared Unicode tricks and returns a regex plus AutoMod YAML.</p>
        </div>

        <div className="mt-4 grid gap-3">
          {examples.map((example, index) => (
            <label key={index} className="grid gap-2 text-sm text-slate-300">
              <span>Example {index + 1}</span>
              <Textarea
                value={example}
                onChange={(event) => updateExample(index, event.target.value)}
                placeholder="Paste a spam message that slipped through…"
                className="min-h-28 rounded-2xl border-white/10 bg-slate-900/80 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-400/30"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="rounded-full bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </Button>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:240ms]" />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">{apiKeyStatus}</p>
      </Card>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 shadow-sm">
          Error: {error}
        </div>
      )}

      {analysis && (
        <Card className="border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Decoder result</p>
              <p className="text-sm text-slate-400">A shared explanation, regex pattern, and ready-to-apply YAML snippet.</p>
            </div>
            <Badge className={confidenceStyles(analysis.confidence)}>{analysis.confidence}</Badge>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {analysis.tricks.map((trick) => (
              <Badge key={trick} className="bg-white/10 text-slate-100 hover:bg-white/10">
                {trick}
              </Badge>
            ))}
          </div>

          <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-100">Explanation</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{analysis.explanation}</p>
          </details>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Regex pattern</p>
                <p className="text-xs text-slate-400">Copy this pattern into Code Mode or use it in AutoMod.</p>
              </div>
              <Button
                variant="ghost"
                onClick={handleCopyRegex}
                className="rounded-full text-slate-200 hover:bg-white/8 hover:text-white"
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

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-medium">AutoMod YAML</p>
                <p className="text-xs text-slate-400">Apply the generated rule directly to the shared rule state.</p>
              </div>
              <Button
                onClick={handleApplyYaml}
                className="rounded-full bg-sky-400 px-4 text-slate-950 hover:bg-sky-300"
              >
                {appliedYaml ? 'Applied' : 'Apply to Rules'}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto bg-slate-950/50 px-4 py-3 font-mono text-xs leading-6 text-emerald-200">
              {analysis.automodYaml}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}