import React, { useEffect, useRef, useState } from 'react';
import { Chat, decodeFrames, type KnownModelIds } from '@hashbrownai/core';

export function ChatBox(props: { model: KnownModelIds }) {
  const [input, setInput] = useState('Summarize the key risks in ingredients procurement.');
  const [messages, setMessages] = useState<Chat.Api.Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || streaming) return;

    setStreaming(true);

    const userMessage: Chat.Api.UserMessage = { role: 'user', content: input };

    // Optimistically add user and placeholder assistant message
    let assistantIndex = -1;
    setMessages((prev) => {
      const next = [...prev, userMessage, { role: 'assistant', content: '' } as Chat.Api.AssistantMessage];
      assistantIndex = next.length - 1;
      return next;
    });

    const request: Chat.Api.CompletionCreateParams = {
      model: props.model,
      system: 'You are a helpful assistant specialized in restaurant supply chain and finance.',
      messages: [...messages, userMessage],
    };

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      return;
    }

    try {
      const abort = new AbortController();
      let acc = '';
      for await (const frame of decodeFrames(res.body, { signal: abort.signal })) {
        if (frame.type === 'chunk') {
          const delta = frame.chunk.choices[0]?.delta?.content ?? '';
          acc += delta ?? '';
          const idx = assistantIndex;
          if (idx >= 0) {
            setMessages((prev) => {
              const next = prev.slice();
              next[idx] = { role: 'assistant', content: acc };
              return next;
            });
          }
        } else if (frame.type === 'finish') {
          setStreaming(false);
        }
      }
    } catch (err) {
      console.error(err);
      setStreaming(false);
    } finally {
      setInput('');
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div ref={outRef} style={{ height: 180, overflow: 'auto', background: '#0b132b', padding: 8, borderRadius: 6 }}>
        {messages.map((m, i) => (
          <div key={i}>
            <strong>{m.role}: </strong>
            <span>{typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask about supply risks, inventory, costs..." />
        <button onClick={send} disabled={streaming}>Send</button>
      </div>
    </div>
  );
}
