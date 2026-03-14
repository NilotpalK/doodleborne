import { useRef, useCallback, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import { Excalidraw, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import { ApiKeyModal } from './ApiKeyModal';

interface DrawingCanvasProps {
  onBringToLife: (png: Blob, svg: SVGSVGElement) => void;
  isLoading: boolean;
  apiKey: string;
  onSaveKey: (key: string) => void;
}

export function DrawingCanvas({ onBringToLife, isLoading, apiKey, onSaveKey }: DrawingCanvasProps) {
  const excalidrawApiRef = useRef<any>(null);
  const [showModal, setShowModal] = useState(false);

  const handleBringToLife = useCallback(async () => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const elements = api.getSceneElements();
    const appState = api.getAppState();

    if (elements.length === 0) {
      alert('Draw something first!');
      return;
    }

    // Export as PNG blob
    const pngBlob = await exportToBlob({
      elements,
      appState: { ...appState, exportBackground: true },
      files: api.getFiles(),
      mimeType: 'image/png',
      quality: 1,
    });

    // Export as SVG element
    const svgElement = await exportToSvg({
      elements,
      appState: { ...appState, exportBackground: false },
      files: api.getFiles(),
    });

    onBringToLife(pngBlob, svgElement);
  }, [onBringToLife]);

  return (
    <div className="drawing-phase">
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
        />
      </div>

      <div className="bring-to-life-bar">
        <button
          className={`api-key-btn ${apiKey ? 'has-key' : ''}`}
          onClick={() => setShowModal(true)}
          title={apiKey ? 'API key saved ✓' : 'Set Gemini API key'}
        >
          🔑 {apiKey ? 'API Key ✓' : 'API Key'}
        </button>

        <button
          className="bring-to-life-btn"
          onClick={handleBringToLife}
          disabled={isLoading || !apiKey}
          title={!apiKey ? 'Set a Gemini API key first 🔑' : undefined}
        >
          {isLoading ? '✏️ Thinking...' : '✨ Bring to Life'}
        </button>
      </div>

      {showModal && (
        <ApiKeyModal
          currentKey={apiKey}
          onSave={onSaveKey}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
