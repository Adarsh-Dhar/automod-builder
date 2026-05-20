import React, { useState } from "react";

interface ApiKeyModalProps {
  currentKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export default function ApiKeyModal({ currentKey, onSave, onClose }: ApiKeyModalProps) {
  const [key, setKey] = useState(currentKey);
  const [show, setShow] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-[440px] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-reddit-purple/20 border border-reddit-purple/40 flex items-center justify-center">
            <span className="text-sm">✦</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-reddit-text-primary">Gemini API Key</h2>
            <p className="text-xs text-reddit-text-muted">Required for AI co-pilot (Chat mode)</p>
          </div>
          <button onClick={onClose} className="ml-auto text-reddit-text-muted hover:text-reddit-text-primary">
            ✕
          </button>
        </div>

        <div className="bg-reddit-dark rounded-lg p-3 mb-4 border border-reddit-border">
          <p className="text-xs text-reddit-text-muted leading-relaxed">
            Your key is stored locally in browser memory only — it is never sent to any server other than Google's Gemini API directly from your browser.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-reddit-text-secondary mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza..."
              className="w-full bg-reddit-dark border border-reddit-border rounded-md px-3 py-2 text-sm text-reddit-text-primary font-mono focus:outline-none focus:border-reddit-blue pr-16"
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-reddit-text-muted hover:text-reddit-text-secondary transition-colors px-2"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="text-xs text-reddit-text-muted mb-4">
          Get your key at{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-reddit-blue hover:underline"
          >
            aistudio.google.com/app/apikey
          </a>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onSave(key.trim())}
            disabled={!key.trim()}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
