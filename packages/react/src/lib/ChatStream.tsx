import { useEffect, useState } from 'react';

function ChatStream({ url, request }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    async function fetchStream() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        if (!response.ok)
          throw new Error(`HTTP error! Status: ${response.status}`);
        if (!response.body) throw new Error('Response body is null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const jsonChunks = chunk.split(/(?<=})(?={)/);

          for (const jsonChunk of jsonChunks) {
            if (jsonChunk.trim()) {
              try {
                const data = JSON.parse(jsonChunk);
                if (isMounted) {
                  setMessages((prev) => [...prev, data]);
                }
              } catch (e) {
                console.error('Error parsing JSON chunk:', e);
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchStream();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [url, request]);

  return (
    <div>
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      {messages.map((msg, i) => (
        <div key={i}>{JSON.stringify(msg)}</div>
      ))}
    </div>
  );
}
