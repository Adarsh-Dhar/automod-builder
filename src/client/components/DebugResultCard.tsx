import { useMemo, useState } from 'react';
import type { DebugMatch, DebugResponse } from '../../shared/debug-types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface DebugResultCardProps {
  result: DebugResponse;
  onApplyYaml: (yaml: string) => void;
}

type HighlightToken = {
  text: string;
  className: string;
};

function confidenceStyles(confidence: DebugMatch['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20';
    case 'medium':
      return 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/20';
    default:
      return 'bg-red-400/15 text-red-200 hover:bg-red-400/20';
  }
}

function tokenizeYaml(line: string): HighlightToken[] {
  const tokens = line.match(/#.*$|"[^"]*"|'[^']*'|\b(?:true|false|null|yes|no)\b|\b\d+\b|[:-]|[^:\-\s][^:\n]*/g) ?? [line];

  return tokens.map((token) => {
    if (token.startsWith('#')) {
      return { text: token, className: 'text-slate-500' };
    }

    if (token === ':' || token === '-') {
      return { text: token, className: 'text-amber-300' };
    }

    if (token.startsWith('"') || token.startsWith("'")) {
      return { text: token, className: 'text-emerald-300' };
    }

    if (/^\d+$/.test(token)) {
      return { text: token, className: 'text-sky-300' };
    }

    if (/^(true|false|null|yes|no)$/i.test(token)) {
      return { text: token, className: 'text-fuchsia-300' };
    }

    return { text: token, className: 'text-slate-100' };
  });
}

function lineNumberForCondition(match: DebugMatch): number {
  const lines = match.rawYaml.split('\n');
  const candidate = match.matchedCondition.field;

  const relativeLine = lines.findIndex((line) => line.trimStart().startsWith(`${candidate}:`));
  if (relativeLine >= 0) {
    return match.lineStart + relativeLine;
  }

  return match.lineStart;
}

function MatchSnippet({ match }: { match: DebugMatch }) {
  const lines = useMemo(() => match.rawYaml.split('\n'), [match.rawYaml]);
  const guiltyLine = lineNumberForCondition(match);
  const guiltyRelative = guiltyLine - match.lineStart;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{match.ruleName}</p>
          <p className="text-xs text-slate-400">Lines {match.lineStart}-{match.lineEnd}</p>
        </div>
        <Badge className={confidenceStyles(match.confidence)}>{match.confidence}</Badge>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="overflow-auto rounded-xl border border-white/10 bg-black/30 p-3">
          <pre className="font-mono text-[11px] leading-6 text-slate-100">
            {lines.map((line, index) => {
              const isGuilty = index === guiltyRelative;
              return (
                <div key={`${match.ruleName}-${index}`} className={`flex gap-3 ${isGuilty ? 'bg-amber-400/10' : ''}`}>
                  <span className={`w-10 shrink-0 text-right ${isGuilty ? 'text-amber-300' : 'text-slate-500'}`}>
                    {match.lineStart + index}
                  </span>
                  <span className={`shrink-0 ${isGuilty ? 'text-amber-300' : 'text-slate-500'}`}>{isGuilty ? '→' : ' '}</span>
                  <span className="flex-1 whitespace-pre-wrap wrap-break-word">
                    {tokenizeYaml(line).map((token, tokenIndex) => (
                      <span key={tokenIndex} className={token.className}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </pre>
        </div>

        <div className="flex flex-col gap-2 md:pt-1">
          <Badge className="w-fit bg-white/10 text-slate-100 hover:bg-white/10">
            {match.matchedCondition.field} {match.matchedCondition.comparator}
          </Badge>
          <p className="max-w-xs text-xs leading-5 text-slate-400">
            {match.matchedCondition.value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DebugResultCard({ result, onApplyYaml }: DebugResultCardProps) {
  const [applied, setApplied] = useState(false);
  const confidence = result.matches[0]?.confidence ?? 'low';

  const handleApply = () => {
    onApplyYaml(result.aiFixYaml);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <Card className="border-white/10 bg-slate-950/60 p-4 text-slate-100 shadow-none rounded-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Debug result</p>
          <h3 className="mt-1 text-lg font-semibold">{result.postTitle}</h3>
          <p className="mt-1 text-sm text-slate-400">u/{result.postAuthor} · {result.postId}</p>
        </div>
        <Badge className={confidenceStyles(confidence)}>{confidence}</Badge>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-slate-100">Post body</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{result.postBody || 'No body text available.'}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-100">Matched blocks</p>
            <p className="text-xs text-slate-400">Ordered by confidence, highest first.</p>
          </div>
          <Button
            onClick={handleApply}
            className="rounded-full bg-sky-400 px-4 text-slate-950 hover:bg-sky-300"
          >
            {applied ? 'Applied' : 'Apply Fix'}
          </Button>
        </div>

        <div className="grid gap-4">
          {result.matches.length > 0 ? (
            result.matches.map((match) => <MatchSnippet key={`${match.ruleName}-${match.lineStart}`} match={match} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              No matching rule blocks were found.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-slate-100">Suggested rewrite</p>
          <pre className="mt-3 overflow-auto rounded-xl bg-slate-950/70 p-3 font-mono text-[12px] leading-6 text-slate-100">
            {result.aiFixYaml || 'Gemini did not return a rewrite.'}
          </pre>
        </div>
      </div>
    </Card>
  );
}