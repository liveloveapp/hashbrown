import { createVAD } from '@hashbrownai/vox';
import createModule from '@hashbrownai/vox/loader';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../shared/button';

export const VADTest = () => {
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [decision, setDecision] = useState<'VOICE' | 'NO VOICE' | ''>('');
  const [mode, setMode] = useState<0 | 1 | 2 | 3>(2);
  const vadRef = useRef<ReturnType<typeof createVAD> | null>(null);

  useEffect(() => {
    const vad = createVAD({
      mode,
      onDecision: (d) => setDecision(d === 1 ? 'VOICE' : 'NO VOICE'),
    });

    vadRef.current = vad;

    vad.initialize(createModule).catch(() => {
      setStatus('error');
    });

    return () => {
      vad.dispose();
    };
  }, []);

  const handleStart = async () => {
    if (!vadRef.current) return;
    setStatus('starting');
    try {
      await vadRef.current.start();
      setStatus('running');
    } catch {
      setStatus('error');
    }
  };

  const handleStop = () => {
    vadRef.current?.stop();
    setStatus('idle');
    setDecision('');
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.target.value) as 0 | 1 | 2 | 3;
    setMode(next);
    vadRef.current?.setMode(next);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-lg font-bold">VAD Test</div>
      <div className="space-y-2">
        <Button
          onClick={status === 'running' ? handleStop : handleStart}
          disabled={status === 'starting'}
        >
          {status === 'running' ? 'Stop' : 'Start'}
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="mode">Mode:</label>
          <select
            id="mode"
            value={mode}
            onChange={handleModeChange}
            className="border rounded px-2 py-1"
            disabled={status === 'starting'}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div className="text-sm">
          Status: {status}
        </div>
        {decision && (
          <div className={`text-2xl font-bold ${decision === 'VOICE' ? 'text-green-600' : 'text-gray-500'}`}>
            {decision}
          </div>
        )}
      </div>
    </div>
  );
};
