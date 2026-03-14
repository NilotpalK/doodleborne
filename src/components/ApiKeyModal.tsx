import { useState, useEffect } from 'react';

interface ApiKeyModalProps {
  onSave: (key: string) => void;
  onClose: () => void;
  currentKey: string;
}

export function ApiKeyModal({ onSave, onClose, currentKey }: ApiKeyModalProps) {
  const [value, setValue] = useState(currentKey);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
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
          className="modal-input"
          type="password"
          placeholder="Paste your API key here..."
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          autoFocus
        />
        <a
          className="modal-link"
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
        >
          ✨ Get a free key at Google AI Studio →
        </a>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-save"
            onClick={handleSave}
            disabled={!value.trim()}
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
