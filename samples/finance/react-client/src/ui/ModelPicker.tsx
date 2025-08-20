import React, { useEffect, useMemo, useState } from 'react';
import { type KnownModelIds } from '@hashbrownai/core';

const OPENAI: KnownModelIds[] = [
  'gpt-3.5',
  'gpt-4',
  'gpt-4o',
  'gpt-4o-mini',
  'o1-mini',
  'o1',
  'o1-pro',
  'o3-mini',
  'o3-mini-high',
  'o3',
  'o3-pro',
  'o4-mini',
  'o4-mini-high',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5'
];

const GOOGLE: KnownModelIds[] = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
];

const WRITER: KnownModelIds[] = [
  'palmyra-x5',
  'palmyra-x4',
  'palmyra-x-003-instruct',
  'palmyra-vision',
  'palmyra-med',
  'palmyra-fin',
  'palmyra-creative'
];

export function ModelPicker(props: { value: KnownModelIds; onChange: (v: KnownModelIds) => void }) {
  const isAzure = useMemo(() => String(props.value).includes('@'), [props.value]);

  const [custom, setCustom] = useState<string>(() => (isAzure ? String(props.value) : 'gpt-4o-mini@my-deployment'));

  // Keep local input in sync if parent changes to an Azure value externally
  useEffect(() => {
    if (isAzure) setCustom(String(props.value));
  }, [isAzure, props.value]);

  const selectValue = isAzure ? '__custom__' : (props.value as string);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <label>
        Model
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') return; // user will type below
            props.onChange(v as KnownModelIds);
          }}
        >
          <option value="__custom__">Custom (Azure/OpenAI)</option>
          <optgroup label="OpenAI">
            {OPENAI.map((m) => (
              <option key={m as string} value={m as string}>{m}</option>
            ))}
          </optgroup>
          <optgroup label="Google">
            {GOOGLE.map((m) => (
              <option key={m as string} value={m as string}>{m}</option>
            ))}
          </optgroup>
          <optgroup label="Writer">
            {WRITER.map((m) => (
              <option key={m as string} value={m as string}>{m}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <input
        aria-label="Custom Azure/OpenAI model"
        placeholder="e.g. gpt-4o-mini@my-deployment"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={() => {
          if (custom.trim()) props.onChange(custom.trim() as KnownModelIds);
        }}
        style={{ minWidth: 260 }}
      />
    </div>
  );
}
