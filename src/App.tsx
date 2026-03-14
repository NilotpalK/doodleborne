import { useState, useCallback } from 'react';
import { DrawingCanvas } from './components/DrawingCanvas';
import { InteractiveCanvas } from './components/InteractiveCanvas';
import './App.css';

type Phase = 'drawing' | 'loading' | 'interactive';

export interface IdentifyResult {
  object: string;
  category: 'movable' | 'ambient' | 'unsure';
  preset: string | null;
  facing: string;       // 'right' | 'left' | 'up' | 'down' | 'none'
  exhaust_side: string; // 'left' | 'right' | 'top' | 'bottom' | 'none'
}

const BACKEND_URL = 'http://localhost:8000';

export default function App() {
  const [phase, setPhase] = useState<Phase>('drawing');
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [sketchSvg, setSketchSvg] = useState<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBringToLife = useCallback(async (png: Blob, svg: SVGSVGElement) => {
    setPhase('loading');
    setError(null);
    setSketchSvg(svg);

    try {
      const formData = new FormData();
      formData.append('file', png, 'sketch.png');

      const res = await fetch(`${BACKEND_URL}/identify`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Backend error ${res.status}: ${detail}`);
      }

      const result: IdentifyResult = await res.json();
      console.log('Identified:', result);
      setIdentifyResult(result);
      setPhase('interactive');   // ← straight to interactive, no more result card
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('drawing');
    }
  }, []);

  const handleExit = useCallback(() => {
    setPhase('drawing');
    setIdentifyResult(null);
    setSketchSvg(null);
  }, []);

  return (
    <div className="app">
      {phase === 'drawing' && (
        <>
          <DrawingCanvas onBringToLife={handleBringToLife} isLoading={false} />
          {error && <div className="error-banner">{error}</div>}
        </>
      )}

      {phase === 'loading' && (
        <div className="loading-screen">
          <p className="loading-text">✏️ Bringing your sketch to life...</p>
        </div>
      )}

      {phase === 'interactive' && identifyResult && sketchSvg && (
        <InteractiveCanvas
          sketchSvg={sketchSvg}
          preset={identifyResult.preset ?? 'car'}
          exhaustSide={identifyResult.exhaust_side ?? 'none'}
          onExit={handleExit}
        />
      )}
    </div>
  );
}
