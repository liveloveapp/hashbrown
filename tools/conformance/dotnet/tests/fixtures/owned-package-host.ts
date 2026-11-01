import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates a complete guarded package descriptor with optional controlled Node launcher for spawn tests. */
export function ownedDescriptor(launcherSource?: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hashbrown-launch-')));
  const hash = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const files: Record<string, string> = {};
  const put = (file: string, text: string) => {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), text);
    files[file] = hash(text);
  };
  for (const file of [
    'sdk/dotnet',
    'sdk/host/fxr/10.0.13/libhostfxr.dylib',
    'sdk/shared/Microsoft.NETCore.App/10.0.13/System.Private.CoreLib.dll',
    'sdk/shared/Microsoft.AspNetCore.App/10.0.13/Microsoft.AspNetCore.dll',
  ])
    put(
      file,
      file === 'sdk/dotnet' && launcherSource
        ? launcherSource
        : 'owned runtime ' + file,
    );
  if (launcherSource) chmodSync(join(root, 'sdk/dotnet'), 0o755);
  const runtimeInputs = Object.fromEntries(
    Object.entries(files).map(([file, value]) => [join(root, file), value]),
  );
  const roles = Object.fromEntries(
    ['fixture', 'probe'].map((name) => {
      const directory = 'roles/' + name;
      for (const file of [
        'Program.cs',
        'Consumer.csproj',
        'evaluation.json',
        'obj/project.assets.json',
        'packages.lock.json',
        'bin/Release/net10.0/Consumer.dll',
        'bin/Release/net10.0/Consumer.deps.json',
        'bin/Release/net10.0/Consumer.runtimeconfig.json',
      ])
        put(directory + '/' + file, 'owned app ' + file);
      put(
        directory + '/bin/Release/net10.0/Hashbrown.AspNetCore.dll',
        'owned package',
      );
      return [
        name,
        {
          directory,
          executable: directory + '/bin/Release/net10.0/Consumer.dll',
          library: directory + '/bin/Release/net10.0/Hashbrown.AspNetCore.dll',
          launcher: join(root, 'sdk/dotnet'),
          compile: [directory + '/Program.cs'],
          evaluation: {
            Items: {
              Compile: [{ FullPath: join(root, directory, 'Program.cs') }],
              ProjectReference: [],
              Reference: [],
              ReferencePath: [],
              PackageReference: [
                {
                  Identity: 'Hashbrown.AspNetCore',
                  Version: '[0.1.0-preview.1]',
                },
              ],
            },
            Properties: {
              MSBuildAllProjects: join(root, directory, 'Consumer.csproj'),
            },
            Imports: [],
          },
          files: Object.fromEntries(
            Object.entries(files).filter(([file]) =>
              file.startsWith(directory + '/'),
            ),
          ),
          inputs: {
            [join(root, directory, 'Consumer.csproj')]:
              files[directory + '/Consumer.csproj'],
          },
          runtimeInputs,
          runtimeTrees: [join(root, 'sdk/host/fxr')],
        },
      ];
    }),
  );
  put('Program.cs', 'owned source');
  put('NuGet.Config', 'owned config');
  put('global.json', 'owned sdk');
  put('candidate.nupkg', 'owned archive');
  const sourceTrees = [
    {
      directory: 'packages/dotnet',
      exclude: ['bin/', 'obj/', 'tools/bin/', 'tools/obj/'],
    },
    ...['nuget-consumer', 'Testing', 'harness', 'specs'].map((name) => ({
      directory: 'tools/conformance/dotnet/' + name,
      exclude: [],
    })),
  ];
  for (const tree of sourceTrees)
    mkdirSync(join(root, tree.directory), { recursive: true });
  const metadata = JSON.stringify({
    root,
    sdkRoot: join(root, 'sdk'),
    repository: root,
    files,
    archive: 'candidate.nupkg',
    sha256: files['candidate.nupkg'],
    sources: { 'Program.cs': files['Program.cs'] },
    sourceTrees,
    environment: {},
    loaded: {
      identity:
        'Hashbrown.AspNetCore, Version=0.1.0.0, Culture=neutral, PublicKeyToken=null',
      sha256:
        files['roles/fixture/bin/Release/net10.0/Hashbrown.AspNetCore.dll'],
    },
    roles,
  });
  writeFileSync(join(root, 'metadata.json'), metadata);
  const pointer = JSON.stringify({
    metadata: join(root, 'metadata.json'),
    sha256: hash(metadata),
  });
  writeFileSync(join(root, 'pointer.json'), pointer);
  writeFileSync(join(root, 'pointer.json.sha256'), hash(pointer));
  return {
    root,
    selection: {
      HASHBROWN_DOTNET_HOST_MODE: 'package',
      HASHBROWN_DOTNET_CONSUMER_METADATA: join(root, 'pointer.json'),
      HASHBROWN_DOTNET_CONSUMER_SHA256: hash(pointer),
    },
  };
}
