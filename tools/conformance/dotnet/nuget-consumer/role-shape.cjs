const assert = require('node:assert/strict');
const path = require('node:path');

const fail = (condition, detail) =>
  assert.ok(condition, `Package role schema: ${detail}`);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const absolute = (value) =>
  typeof value === 'string' &&
  path.isAbsolute(value) &&
  path.resolve(value) === value;
const relative = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\\') &&
  !path.posix.isAbsolute(value) &&
  path.posix.normalize(value) === value &&
  value !== '..' &&
  !value.startsWith('../');
const hash = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const within = (root, file) => file.startsWith(root + path.sep);
const fingerprints = (value, keyCheck, detail) => {
  fail(
    record(value) && Object.keys(value).length > 0,
    detail + ' must be a nonempty hash map',
  );
  for (const [file, digest] of Object.entries(value))
    fail(keyCheck(file) && hash(digest), detail + ' has an invalid path/hash');
};

/** Rejects incomplete or independently resealed package-role evidence before any launch or qualification effect. */
function assertPackageRoles(metadata) {
  fail(
    record(metadata) && absolute(metadata.root) && absolute(metadata.sdkRoot),
    'owned root and SDK root required',
  );
  fail(
    record(metadata.roles) &&
      JSON.stringify(Object.keys(metadata.roles).sort()) ===
        JSON.stringify(['fixture', 'probe']),
    'exact fixture and probe roles required',
  );
  fail(absolute(metadata.repository), 'source root required');
  fingerprints(metadata.files, relative, 'root files');
  fingerprints(metadata.sources, relative, 'source files');
  fail(
    relative(metadata.archive) && hash(metadata.sha256),
    'candidate archive evidence required',
  );
  fail(
    record(metadata.environment) &&
      Object.values(metadata.environment).every(
        (value) => typeof value === 'string',
      ),
    'controlled environment values required',
  );
  fail(
    record(metadata.loaded) &&
      typeof metadata.loaded.identity === 'string' &&
      metadata.loaded.identity.length > 0 &&
      hash(metadata.loaded.sha256),
    'loaded implementation evidence required',
  );
  const expectedTrees = [
    {
      directory: 'packages/dotnet',
      exclude: ['bin/', 'obj/', 'tools/bin/', 'tools/obj/'],
    },
    ...['nuget-consumer', 'Testing', 'harness', 'specs'].map((name) => ({
      directory: 'tools/conformance/dotnet/' + name,
      exclude: [],
    })),
  ];
  fail(
    Array.isArray(metadata.sourceTrees) &&
      metadata.sourceTrees.length === expectedTrees.length,
    'source discovery trees required',
  );
  for (const expected of expectedTrees) {
    const matches = metadata.sourceTrees.filter(
      (tree) => record(tree) && tree.directory === expected.directory,
    );
    fail(
      matches.length === 1 &&
        Array.isArray(matches[0].exclude) &&
        JSON.stringify([...matches[0].exclude].sort()) ===
          JSON.stringify([...expected.exclude].sort()),
      'source discovery tree closure differs',
    );
  }
  for (const name of ['fixture', 'probe']) {
    const role = metadata.roles[name];
    const directory = 'roles/' + name;
    const output = directory + '/bin/Release/net10.0/';
    fail(
      record(role) && role.directory === directory,
      'owned role directory required',
    );
    fail(
      role.executable === output + 'Consumer.dll' &&
        role.library === output + 'Hashbrown.AspNetCore.dll',
      'exact owned executable and library required',
    );
    fingerprints(
      role.files,
      (file) => relative(file) && file.startsWith(directory + '/'),
      'role files',
    );
    for (const [file, digest] of Object.entries(role.files))
      fail(metadata.files[file] === digest, 'role/root hash evidence differs');
    for (const file of [
      role.executable,
      role.library,
      directory + '/Program.cs',
      directory + '/Consumer.csproj',
      directory + '/evaluation.json',
      directory + '/obj/project.assets.json',
      directory + '/packages.lock.json',
      output + 'Consumer.deps.json',
      output + 'Consumer.runtimeconfig.json',
    ])
      fail(
        hash(role.files[file]),
        'required executable/source/config/evaluation file missing',
      );
    fail(
      Array.isArray(role.compile) &&
        role.compile.length > 0 &&
        role.compile.every(
          (file) =>
            relative(file) &&
            file.startsWith(directory + '/') &&
            hash(role.files[file]),
        ),
      'compiled source evidence required',
    );
    fail(
      record(role.evaluation) &&
        record(role.evaluation.Items) &&
        record(role.evaluation.Properties) &&
        Array.isArray(role.evaluation.Imports),
      'evaluated input evidence required',
    );
    for (const item of [
      'Compile',
      'ProjectReference',
      'Reference',
      'ReferencePath',
      'PackageReference',
    ])
      fail(
        Array.isArray(role.evaluation.Items[item]),
        'evaluated item arrays required',
      );
    fail(
      role.evaluation.Items.ProjectReference.length === 0 &&
        role.evaluation.Items.PackageReference.length === 1,
      'sole PackageReference evidence required',
    );
    fingerprints(
      role.inputs,
      (file) =>
        absolute(file) &&
        (within(metadata.root, file) || within(metadata.sdkRoot, file)),
      'evaluated inputs',
    );
    fail(
      absolute(role.launcher) &&
        within(metadata.sdkRoot, role.launcher) &&
        /^dotnet(?:\.exe)?$/.test(path.basename(role.launcher)),
      'pinned SDK launcher required',
    );
    fingerprints(
      role.runtimeInputs,
      (file) =>
        absolute(file) &&
        (file === role.launcher ||
          within(path.join(metadata.sdkRoot, 'host/fxr'), file) ||
          within(
            path.join(metadata.sdkRoot, 'shared/Microsoft.NETCore.App'),
            file,
          ) ||
          within(
            path.join(metadata.sdkRoot, 'shared/Microsoft.AspNetCore.App'),
            file,
          )),
      'runtime inputs',
    );
    fail(
      hash(role.runtimeInputs[role.launcher]),
      'launcher runtime hash required',
    );
    const runtimeFiles = Object.keys(role.runtimeInputs);
    for (const family of [
      'host/fxr',
      'shared/Microsoft.NETCore.App',
      'shared/Microsoft.AspNetCore.App',
    ])
      fail(
        runtimeFiles.some((file) =>
          within(path.join(metadata.sdkRoot, family), file),
        ),
        'hostfxr and both shared runtime families required',
      );
    fail(
      Array.isArray(role.runtimeTrees) &&
        role.runtimeTrees.length === 1 &&
        role.runtimeTrees[0] === path.join(metadata.sdkRoot, 'host/fxr'),
      'hostfxr discovery tree required',
    );
  }
}

exports.assertPackageRoles = assertPackageRoles;
