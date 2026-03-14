import { useRef, useCallback } from 'react';
import '@excalidraw/excalidraw/index.css';
import { Excalidraw, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';

interface DrawingCanvasProps {
  onBringToLife: (png: Blob, svg: SVGSVGElement) => void;
  isLoading: boolean;
}

export function DrawingCanvas({ onBringToLife, isLoading }: DrawingCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawApiRef = useRef<any>(null);

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
          className="bring-to-life-btn"
          onClick={handleBringToLife}
          disabled={isLoading}
        >
          {isLoading ? '✏️ Thinking...' : '✨ Bring to Life'}
        </button>
      </div>
    </div>
  );
}
