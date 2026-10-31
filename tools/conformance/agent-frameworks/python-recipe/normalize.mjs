/** Normalize generated UUID envelopes only, preserving application activity IDs and payloads. */
export function normalizeWireEvents(events) {
  const identities = new Map();
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const identity = (value) => {
    if (typeof value !== 'string' || !uuid.test(value)) return value;
    if (!identities.has(value))
      identities.set(value, `generated-${identities.size + 1}`);
    return identities.get(value);
  };
  return events.map((event) =>
    Object.fromEntries(
      Object.entries(event).map(([key, value]) => {
        if (key === 'timestamp') return [key, '<generated>'];
        if (
          key === 'messageId' ||
          key === 'parentMessageId' ||
          (key === 'entityId' &&
            event.type === 'REASONING_ENCRYPTED_VALUE' &&
            event.subtype === 'message')
        )
          return [key, identity(value)];
        return [key, value];
      }),
    ),
  );
}
