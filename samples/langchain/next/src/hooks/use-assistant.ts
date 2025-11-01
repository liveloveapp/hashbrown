import { Assistant, Client } from '@langchain/langgraph-sdk';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_LANGGRAPH_API_URL = 'http://localhost:2024';
const DEFAULT_ASSISTANT_NAME = 'plan';
const DEFAULT_LIMIT = 25;

export interface UseAssistantOptions {
  preferredName?: string;
  limit?: number;
  initialAssistantId?: string | null;
  apiUrl?: string;
}

export interface UseAssistantResult {
  assistantId: string | null;
  assistants: Assistant[];
  isLoading: boolean;
  error: string | null;
  apiUrl: string;
}

export function useAssistant(
  options: UseAssistantOptions = {},
): UseAssistantResult {
  const {
    preferredName = DEFAULT_ASSISTANT_NAME,
    limit = DEFAULT_LIMIT,
    initialAssistantId = process.env.NEXT_PUBLIC_PLAN_ASSISTANT_ID ?? null,
    apiUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ??
      DEFAULT_LANGGRAPH_API_URL,
  } = options;

  const [assistantId, setAssistantId] = useState<string | null>(
    initialAssistantId,
  );
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!initialAssistantId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assistantId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const client = new Client({ apiUrl });

    const fetchAssistants = async () => {
      try {
        const fetchedAssistants = await client.assistants.search({ limit });
        if (cancelled) {
          return;
        }

        setAssistants(fetchedAssistants);

        if (fetchedAssistants.length === 0) {
          setError('No assistants available on the LangGraph server.');
          return;
        }

        const preferred = fetchedAssistants.find((assistant) =>
          assistant.name?.toLowerCase()?.includes(preferredName.toLowerCase()),
        );

        setAssistantId(
          preferred?.assistant_id ?? fetchedAssistants[0]?.assistant_id ?? null,
        );
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load assistants from LangGraph.', err);
          setError('Failed to load assistants from LangGraph.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchAssistants();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, assistantId, limit, preferredName]);

  const sortedAssistants = useMemo(() => assistants, [assistants]);

  return {
    assistantId,
    assistants: sortedAssistants,
    isLoading,
    error,
    apiUrl,
  };
}
