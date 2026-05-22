import { useState } from 'react';
import DebugResultCard from './DebugResultCard';
import { Button } from './ui/button';
import { Card } from './ui/card';
import type { DebugResponse } from '../../shared/debug-types';
import { parsePostId } from '../utils/debug';

type DebuggerModeProps = {
  onApplyYaml: (yaml: string) => void;
};

export default function DebuggerMode({ onApplyYaml }: DebuggerModeProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDebug = async () => {
    setError(null);
    const postId = parsePostId(input);
    if (!postId) {
      setError('Enter a valid post id or URL');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rule-stage/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });

      if (!res.ok) throw new Error('Debug API failed');

      const data = (await res.json()) as { status: string; debug?: DebugResponse };
      if (data?.debug) {
        setResult(data.debug);
      } else {
        setError('No debug result returned');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 grid gap-4">
      <Card className="p-4">
        <p className="text-sm text-slate-300">Enter a Reddit post URL or ID to inspect why AutoModerator triggered.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. https://reddit.com/r/sub/comments/abc123/ or abc123"
            className="flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-white outline-none"
          />
          <Button onClick={handleDebug} disabled={loading}>
            {loading ? 'Running...' : 'Debug Post'}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
      </Card>

      {result && (
        <DebugResultCard result={result} onApplyYaml={onApplyYaml} />
      )}
    </div>
  );
}
