import { useState } from "react";

interface ApiKeyModalProps {
  currentKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export default function ApiKeyModal({ currentKey, onSave, onClose }: ApiKeyModalProps) {
  const [key, setKey] = useState(currentKey);
  const [show, setShow] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#161B22] border border-[#21262D] rounded-lg w-[440px] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#BC8CFF]/20 border border-[#BC8CFF]/40 flex items-center justify-center">
            <span className="text-sm">✦</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#E6EDF3]">Gemini API Key</h2>
            <p className="text-xs text-[#484F58]">Required for AI co-pilot (Chat mode)</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[#484F58] hover:text-[#E6EDF3] transition-colors">
            ✕
          </button>
        </div>

        <div className="bg-[#0D1117] rounded-lg p-3 mb-4 border border-[#21262D]">
          <p className="text-xs text-[#484F58] leading-relaxed">
            Your key is stored in browser memory only — it is sent directly to Google's
            Gemini API from your browser and never passes through any server.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-[#8B949E] mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza..."
              data-testid="input-api-key"
              className="w-full bg-[#0D1117] border border-[#21262D] rounded-md px-3 py-2 text-sm text-[#E6EDF3] font-mono focus:outline-none focus:border-[#58A6FF] pr-16"
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#484F58] hover:text-[#8B949E] transition-colors px-2"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="text-xs text-[#484F58] mb-4">
          Get your free key at{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#58A6FF] hover:underline"
          >
            aistudio.google.com
          </a>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-sm bg-[#161B22] hover:bg-[#21262D] text-[#E6EDF3] border border-[#21262D] font-medium px-4 py-2 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(key.trim())}
            disabled={!key.trim()}
            data-testid="btn-save-api-key"
            className="text-sm bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
