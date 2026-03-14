import { useState, useEffect } from 'react';

interface ApiKeyModalProps {
  onSave: (key: string) => void;
  onClose: () => void;
  currentKey: string;
}

async function validateGeminiKey(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );
    if (res.ok) return null; // valid
    if (res.status === 400 || res.status === 403) return 'Invalid API key — check it and try again.';
    return `Unexpected response (${res.status}) — please try again.`;
  } catch {
    return 'Could not reach Google — check your internet connection.';
  }
}

export function ApiKeyModal({ onSave, onClose, currentKey }: ApiKeyModalProps) {
  const [value, setValue] = useState(currentKey);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset error when user edits the key
  const handleChange = (v: string) => {
    setValue(v);
    setError(null);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setValidating(true);
    setError(null);

    const err = await validateGeminiKey(trimmed);

    setValidating(false);

    if (err) {
      setError(err);
      return;
    }

    onSave(trimmed);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="api-key-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">🔑 Gemini API Key</h2>
        <p className="modal-desc">
          Your key is stored only in your browser and sent directly to the AI.
        </p>
        <input
          className={`modal-input${error ? ' modal-input--error' : ''}`}
          type="password"
          placeholder="Paste your API key here..."
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          autoFocus
          disabled={validating}
        />
        {error && <p className="modal-error">⚠️ {error}</p>}
        <a
          className="modal-link"
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
        >
          ✨ Get a free key at Google AI Studio →
        </a>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose} disabled={validating}>Cancel</button>
          <button
            className="modal-btn-save"
            onClick={handleSave}
            disabled={!value.trim() || validating}
          >
            {validating ? '🔄 Validating...' : 'Save Key'}
          </button>
        </div>
      </div>
    </div>
  );
}
