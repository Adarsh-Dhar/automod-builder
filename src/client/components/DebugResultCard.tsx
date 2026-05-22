import { useState } from 'react';
import type { DebugMatch, DebugResponse } from '../../shared/debug-types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Check, X } from 'lucide-react';

interface DebugResultCardProps {
  result: DebugResponse;
  onApplyYaml: (yaml: string) => void;
}

function confidenceStyles(confidence: DebugMatch['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-[--success]/15 text-[--success] border-[--success]/25';
    case 'medium':
      return 'bg-[--warning]/15 text-[--warning] border-[--warning]/25';
    default:
      return 'bg-[--danger]/15 text-[--danger] border-[--danger]/25';
  }
}

export default function DebugResultCard({ result, onApplyYaml }: DebugResultCardProps) {
  const [applied, setApplied] = useState(false);
  const confidence = result.matches[0]?.confidence ?? 'low';

  // Check if YAML has actual content (not empty/default/template)
  const hasRealYaml = result.aiFixYaml && !result.aiFixYaml.includes("# Rule draft") && !result.aiFixYaml.includes("title (includes): ['']") && result.aiFixYaml.trim().length > 50;

  const handleApply = () => {
    onApplyYaml(result.aiFixYaml);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const hasMatches = result.matches.length > 0;
  const verdictColor = hasMatches ? 'text-[--success]' : 'text-[--danger]';
  const verdictIcon = hasMatches ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />;

  return (
    <Card className="border-[--border] bg-[--surface-2] p-4 text-[--foreground]">
      {/* Verdict Banner */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${hasMatches ? 'bg-[--success]/15 border border-[--success]/25' : 'bg-[--danger]/15 border border-[--danger]/25'}`}>
        <div className={verdictColor}>{verdictIcon}</div>
        <div>
          <p className="font-medium text-[--foreground]">{hasMatches ? 'Rule Matched' : 'No Match'}</p>
          <p className="text-xs text-[--muted-foreground]">{hasMatches ? `${result.matches.length} condition(s) passed` : 'Post would not be affected'}</p>
        </div>
      </div>

      {/* Post Info */}
      <div className="mt-4 border-b border-[--border] pb-3">
        <p className="text-sm font-medium text-[--foreground]">{result.postTitle}</p>
        <p className="text-xs text-[--muted-foreground]">u/{result.postAuthor} · {result.postId}</p>
      </div>

      {/* Condition Results Table */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-[--foreground]">Condition Results</p>
          <Badge variant="outline" className={confidenceStyles(confidence)}>{confidence}</Badge>
        </div>
        
        <div className="rounded-lg border border-[--border] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[--surface-3]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-[--muted-foreground]">Condition</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[--muted-foreground]">Value</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[--muted-foreground]">Threshold</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-[--muted-foreground]">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match, index) => (
                <tr key={`${match.ruleName}-${index}`} className="border-t border-[--border]">
                  <td className="px-3 py-2 text-[--foreground]">{match.matchedCondition.field}</td>
                  <td className="px-3 py-2 text-[--muted-foreground]">{match.matchedCondition.value}</td>
                  <td className="px-3 py-2 text-[--muted-foreground]">{match.matchedCondition.comparator}</td>
                  <td className="px-3 py-2 text-center">
                    <Check className="w-4 h-4 mx-auto text-[--success]" />
                  </td>
                </tr>
              ))}
              {result.matches.length === 0 && (
                <tr className="border-t border-[--border]">
                  <td colSpan={4} className="px-3 py-4 text-center text-[--muted-foreground]">
                    No conditions matched
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suggested Rewrite */}
      {hasRealYaml && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-[--foreground]">Suggested Rewrite</p>
            <Button
              onClick={handleApply}
              size="sm"
              className="bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90"
            >
              {applied ? 'Applied' : 'Apply Fix'}
            </Button>
          </div>
          <pre className="overflow-auto rounded-lg border border-[--border] bg-[--surface-3] p-3 font-mono text-xs leading-6 text-[--foreground]">
            {result.aiFixYaml}
          </pre>
        </div>
      )}
    </Card>
  );
}