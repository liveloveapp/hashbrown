import { readFileSync } from 'node:fs';

const fail = (message) => {
  throw new Error('Invalid .NET reference: ' + message);
};
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string';
const unique = (values, label) => {
  if (new Set(values).size !== values.length) fail('duplicate ' + label);
};

function validateDocs(docs) {
  if (
    !object(docs) ||
    !['summary', 'remarks', 'returns'].every((key) => text(docs[key]))
  )
    fail('documentation text');
  for (const key of ['params', 'typeParams']) {
    if (
      !Array.isArray(docs[key]) ||
      !docs[key].every(
        (item) => object(item) && text(item.name) && text(item.description),
      )
    )
      fail('documentation ' + key);
  }
  if (
    !Array.isArray(docs.references) ||
    !docs.references.every(
      (item) => object(item) && text(item.target) && text(item.text),
    )
  )
    fail('documentation references');
}

/**
 * Read the committed compiled-XML input without running a .NET SDK.
 * @param {string} file - Absolute generated reference file path.
 * @returns {import('./dotnet-reference').DotnetReference} Validated reference data.
 */
export function readReferenceInput(file) {
  let reference;
  try {
    reference = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      'Missing or invalid generated .NET reference; generate packages/dotnet/api/reference-docs.json.',
      { cause: error },
    );
  }
  if (!object(reference) || reference.schemaVersion !== 1)
    fail('schema version');
  if (
    !object(reference.package) ||
    reference.package.id !== 'Hashbrown.AspNetCore' ||
    reference.package.version !== '0.1.0-preview.2' ||
    reference.package.status !== 'unreleased'
  )
    fail('package version or release status');
  if (!Array.isArray(reference.types) || !reference.types.length) fail('types');
  const ids = [];
  for (const type of reference.types) {
    if (
      !object(type) ||
      !text(type.id) ||
      !type.id.startsWith('T:Hashbrown.AspNetCore.') ||
      !text(type.name) ||
      !text(type.slug) ||
      !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(type.slug) ||
      !text(type.declaration) ||
      !type.declaration.trim() ||
      !Array.isArray(type.members)
    )
      fail('type declaration');
    ids.push(type.id);
    validateDocs(type.docs);
    for (const member of type.members) {
      if (
        !object(member) ||
        !text(member.id) ||
        !/^[MPFE]:Hashbrown\.AspNetCore\./.test(member.id) ||
        !text(member.name) ||
        !text(member.anchor) ||
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(member.anchor) ||
        !text(member.declaration) ||
        !member.declaration.trim()
      )
        fail('member declaration');
      ids.push(member.id);
      validateDocs(member.docs);
    }
    unique(
      type.members.map((member) => member.anchor),
      'member anchor',
    );
  }
  unique(ids, 'XML identity');
  unique(
    reference.types.map((type) => type.slug),
    'type slug',
  );
  return reference;
}
