import { createVAD } from '@hashbrownai/vox';
import createModule from '@hashbrownai/vox/loader-single';
import { useEffect, useRef, useState } from 'react';

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

    vad
      .initialize(createModule)
      .catch((err) => {
        console.error('VAD initialize failed', err);
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
    } catch (err) {
      console.error('VAD start failed', err);
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
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>VAD Test</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={status === 'running' ? handleStop : handleStart}
          disabled={status === 'starting'}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: status === 'running' ? '#ef4444' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: status === 'starting' ? 'not-allowed' : 'pointer',
            opacity: status === 'starting' ? 0.5 : 1,
          }}
        >
          {status === 'running' ? 'Stop' : 'Start'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <label htmlFor="mode">Mode:</label>
          <select
            id="mode"
            value={mode}
            onChange={handleModeChange}
            style={{
              border: '1px solid #ccc',
              borderRadius: '0.25rem',
              padding: '0.25rem 0.5rem',
            }}
            disabled={status === 'starting'}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div style={{ fontSize: '0.875rem' }}>
          Status: {status}
        </div>
        {decision && (
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: decision === 'VOICE' ? '#16a34a' : '#6b7280',
          }}>
            {decision}
          </div>
        )}
      </div>
    </div>
  );
};

