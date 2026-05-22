import { useState } from "react";
import { Button } from "./ui/button";
import { Key } from "lucide-react";

interface ApiKeyModalProps {
  currentKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export default function ApiKeyModal({ currentKey, onSave, onClose }: ApiKeyModalProps) {
  const [key, setKey] = useState(currentKey);
  const [show, setShow] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[--surface-2] border border-[--border] rounded-lg w-full max-w-[440px] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[--primary]/20 border border-[--primary]/40 flex items-center justify-center">
            <Key className="w-4 h-4 text-[--primary]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[--foreground]">Gemini API Key</h2>
            <p className="text-xs text-[--muted-foreground]">Required for AI co-pilot (Chat mode)</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[--muted-foreground] hover:text-[--foreground] transition-colors">
            ✕
          </button>
        </div>

        <div className="bg-[--surface-3] rounded-lg p-3 mb-4 border border-[--border]">
          <p className="text-xs text-[--muted-foreground] leading-relaxed">
            Your key is stored in browser memory only — it is sent directly to Google's
            Gemini API from your browser and never passes through any server.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-[--foreground] mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza..."
              data-testid="input-api-key"
              className="w-full bg-[--surface-3] border border-[--border] rounded-md px-3 py-2 text-sm text-[--foreground] font-mono focus:outline-none focus:border-[--primary] pr-16"
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[--muted-foreground] hover:text-[--foreground] transition-colors px-2"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="text-xs text-[--muted-foreground] mb-4">
          Get your free key at{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[--info] hover:underline"
          >
            aistudio.google.com
          </a>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-[--border] text-[--foreground] hover:bg-[--surface-3]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(key.trim())}
            disabled={!key.trim()}
            data-testid="btn-save-api-key"
            className="bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Key
          </Button>
        </div>
      </div>
    </div>
  );
}
