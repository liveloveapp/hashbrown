import { validateChromePromptAudio } from './chrome-prompt-audio';

/** Creates PCM WAV bytes with optional opaque RIFF chunks. */
function wave(
  options: {
    readonly channels?: number;
    readonly sampleRate?: number;
    readonly dataBytes?: number;
    readonly junkBytes?: number;
  } = {},
): Uint8Array<ArrayBuffer> {
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 16000;
  const dataBytes = options.dataBytes ?? sampleRate * channels * 2;
  const junkBytes = options.junkBytes;
  const extra = junkBytes === undefined ? 0 : 8 + junkBytes + (junkBytes % 2);
  const bytes = new Uint8Array(44 + dataBytes + (dataBytes % 2) + extra);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  if (junkBytes !== undefined) {
    text(36, 'JUNK');
    view.setUint32(40, junkBytes, true);
  }
  text(36 + extra, 'data');
  view.setUint32(40 + extra, dataBytes, true);
  return bytes;
}

/** Validates a fresh Blob with an active request signal. */
function validate(bytes: Uint8Array<ArrayBuffer>, maxDurationSeconds?: number) {
  return validateChromePromptAudio(
    new Blob([bytes]),
    { maxDurationSeconds },
    new AbortController().signal,
  );
}

test.each([
  { channels: 1, sampleRate: 8000 },
  { channels: 2, sampleRate: 48000 },
  { junkBytes: 3 },
  { dataBytes: 16000 * 2 * 30 },
])(
  'accepts bounded PCM16 WAV without changing its bytes: %p',
  async (options) => {
    const bytes = wave(options);
    const snapshot = bytes.slice();

    await expect(validate(bytes)).resolves.toBeUndefined();

    expect(bytes.every((byte, index) => byte === snapshot[index])).toBe(true);
  },
);

test.each([
  ['wrong RIFF signature', 0, 0],
  ['big endian RIFX', 3, 'X'.charCodeAt(0)],
  ['wrong WAVE signature', 8, 0],
  ['non PCM encoding', 20, 3],
  ['zero channels', 22, 0],
  ['too many channels', 22, 3],
  ['non PCM16 samples', 34, 8],
  ['inconsistent block align', 32, 4],
  ['inconsistent byte rate', 28, 1],
] as const)('rejects %s', async (_label, offset, value) => {
  const bytes = wave();
  bytes[offset] = value;

  const result = validate(bytes);

  await expect(result).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
    retryable: false,
  });
});

test.each([0, 7999, 48001])(
  'rejects unsupported sample rate %p',
  async (sampleRate) => {
    const bytes = wave({ sampleRate, dataBytes: 32 });

    const result = validate(bytes);

    await expect(result).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
      retryable: false,
    });
  },
);

test.each([0, 1, 3])(
  'rejects empty or unaligned data length %p',
  async (dataBytes) => {
    const bytes = wave({ dataBytes });

    const result = validate(bytes);

    await expect(result).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
      retryable: false,
    });
  },
);

test.each([0, -1, Infinity, NaN])(
  'rejects invalid duration policy %p',
  async (maxDurationSeconds) => {
    const bytes = wave();

    const result = validate(bytes, maxDurationSeconds);

    await expect(result).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
      retryable: false,
    });
  },
);

test('uses PCM data bytes to bound actual duration', async () => {
  const bytes = wave({ dataBytes: 16000 * 2 * 31 });

  const result = validate(bytes);

  await expect(result).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
    retryable: false,
  });
});

test('applies a custom duration bound', async () => {
  const bytes = wave();

  const result = validate(bytes, 0.5);

  await expect(result).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
    retryable: false,
  });
});

test.each([
  'short header',
  'RIFF too short',
  'RIFF too long',
  'chunk overflow',
  'trailing header',
  'missing padding',
  'short fmt',
  'missing fmt',
  'missing data',
  'duplicate fmt',
  'duplicate data',
])('rejects malformed RIFF structure: %s', async (kind) => {
  let bytes = wave({ dataBytes: 2 });
  if (kind === 'short header') bytes = bytes.slice(0, 11);
  else if (kind === 'RIFF too short')
    new DataView(bytes.buffer).setUint32(4, bytes.length - 10, true);
  else if (kind === 'RIFF too long')
    new DataView(bytes.buffer).setUint32(4, bytes.length - 6, true);
  else if (kind === 'chunk overflow')
    new DataView(bytes.buffer).setUint32(40, 0xffffffff, true);
  else if (kind === 'short fmt')
    new DataView(bytes.buffer).setUint32(16, 14, true);
  else if (kind === 'missing fmt') bytes[12] = 'x'.charCodeAt(0);
  else if (kind === 'missing data') bytes[36] = 'x'.charCodeAt(0);
  else if (kind === 'missing padding') {
    bytes = wave({ dataBytes: 2, junkBytes: 3 }).slice(0, 47);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  } else {
    const extra =
      kind === 'trailing header'
        ? new Uint8Array(4)
        : kind === 'duplicate fmt'
          ? bytes.slice(12, 36)
          : bytes.slice(36);
    bytes = new Uint8Array([...bytes, ...extra]);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  }

  const result = validate(bytes);

  await expect(result).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
    retryable: false,
  });
});

test('wraps encoded byte read failures as nonretryable invalid media', async () => {
  const blob = new Blob();
  jest.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('read failed'));

  const result = validateChromePromptAudio(
    blob,
    {},
    new AbortController().signal,
  );

  await expect(result).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
    retryable: false,
  });
});

test('does not read an already cancelled audio input', async () => {
  const blob = new Blob([wave()]);
  const read = jest.spyOn(blob, 'arrayBuffer');
  const controller = new AbortController();
  controller.abort();

  const result = validateChromePromptAudio(blob, {}, controller.signal);

  await expect(result).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
  expect(read).not.toHaveBeenCalled();
});

test('settles cancellation while a byte read is pending and owns its late rejection', async () => {
  const blob = new Blob();
  let rejectRead!: (reason: unknown) => void;
  jest.spyOn(blob, 'arrayBuffer').mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectRead = reject;
    }),
  );
  const controller = new AbortController();
  const result = validateChromePromptAudio(blob, {}, controller.signal);

  controller.abort();
  const rejected = expect(result).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
  await rejected;
  rejectRead(new Error('late read failure'));

  await Promise.resolve();
});

test('checks cancellation after byte acquisition', async () => {
  const blob = new Blob();
  const controller = new AbortController();
  jest.spyOn(blob, 'arrayBuffer').mockImplementation(async () => {
    controller.abort();
    return wave().buffer;
  });

  const result = validateChromePromptAudio(blob, {}, controller.signal);

  await expect(result).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
});
