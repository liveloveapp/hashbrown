/** Normalize only generated message envelopes/timestamps, preserving tool IDs and payloads. */
export function normalizeEvents(events) {
  const messages = new Map();
  const identity = (value) => {
    if (!messages.has(value)) messages.set(value, `message-${messages.size + 1}`);
    return messages.get(value);
  };
  return events.map((event) => Object.fromEntries(Object.entries(event).map(([key, value]) => {
    if (key === 'timestamp') return [key, '<generated>'];
    if (key === 'messageId' || key === 'parentMessageId' || (key === 'entityId' && event.type === 'REASONING_ENCRYPTED_VALUE' && event.subtype === 'message')) return [key, identity(value)];
    return [key, value];
  })));
}

/** Normalize native framework envelope fields only, retaining all callback/request payloads. */
export function normalizeExecution(execution) {
  const runs = new Map();
  const nativeMessage = (message) => {
    const result = { ...message };
    if ('timestamp' in result) result.timestamp = '<generated>';
    if (result.run_id) {
      if (!runs.has(result.run_id)) runs.set(result.run_id, `run-${runs.size + 1}`);
      result.run_id = runs.get(result.run_id);
    }
    result.parts = result.parts.map((part) => 'timestamp' in part ? { ...part, timestamp: '<generated>' } : { ...part });
    return result;
  };
  return { ...execution, history: execution.history.map(nativeMessage), modelRequests: execution.modelRequests.map((messages) => messages.map(nativeMessage)) };
}
