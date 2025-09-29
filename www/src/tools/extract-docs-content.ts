import {
  Extractor,
  ExtractorConfig,
  IConfigFile,
} from '@microsoft/api-extractor';
import {
  DocExcerpt,
  DocNode,
  TSDocConfiguration,
  TSDocParser,
} from '@microsoft/tsdoc';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import {
  ApiDocs,
  ApiExcerptToken,
  ApiExcerptTokenKind,
  ApiMember,
  ApiMemberSummary,
  ApiPackageReport,
  ApiReport,
  CanonicalReference,
  MinimizedApiMemberSummary,
  MinimizedApiPackageReport,
  MinimizedApiReport,
} from '../app/models/api-report.models';

interface ApiPackage {
  name: string;
  rewriteName?: string;
  alias: string;
  entryPoint: string;
}

const MONOREPO_ROOT = path.join(process.cwd(), '../');
const ANGULAR_THETA_CHAR = 'ɵ';

const PACKAGES_TO_PARSE: ApiPackage[] = [
  {
    name: '@hashbrownai/angular',
    alias: 'angular',
    entryPoint: 'dist/packages/angular/index.d.ts',
  },
  {
    name: '@hashbrownai/core',
    alias: 'core',
    entryPoint: 'dist/packages/core/src/index.d.ts',
  },
  {
    name: '@hashbrownai/react',
    alias: 'react',
    entryPoint: 'dist/packages/react/index.d.ts',
  },
];

function loadTsDocConfig(): TSDocConfiguration {
  // Use default TSDoc configuration without custom tags
  return new TSDocConfiguration();
}

function loadExtractorConfig(
  pkg: ApiPackage,
  cb: (config: IConfigFile) => void,
) {
  const configFilePath = path.join(
    MONOREPO_ROOT,
    './www/src/tools/api-extractor.json',
  );
  const configFile = ExtractorConfig.loadFile(configFilePath);

  configFile.mainEntryPointFilePath = path.join(MONOREPO_ROOT, pkg.entryPoint);

  configFile.compiler = {
    tsconfigFilePath: path.join(MONOREPO_ROOT, 'tsconfig.docs.json'),
  };

  cb(configFile);

  return ExtractorConfig.prepare({
    configObject: configFile,
    configObjectFullPath: configFilePath,
    packageJsonFullPath: path.join(MONOREPO_ROOT, 'package.json'),
    packageJson: {
      name: pkg.name,
    },
  });
}

function createApiReport(pkg: ApiPackage) {
  const config = loadExtractorConfig(pkg, (configFile) => {
    configFile.docModel = {
      enabled: true,
      apiJsonFilePath: path.join(
        MONOREPO_ROOT,
        `dist/reports/${pkg.alias}.api.json`,
      ),
    };
  });

  const extractorResult = Extractor.invoke(config, {
    localBuild: true,
    showVerboseMessages: true,
  });

  if (!extractorResult.succeeded) {
    throw new Error(
      `API Extractor completed with ${extractorResult.errorCount} errors` +
        ` and ${extractorResult.warningCount} warnings`,
    );
  }

  // Rewrite the package name if needed
  if (pkg.rewriteName) {
    const content = fs.readFileSync(config.apiJsonFilePath, 'utf-8');
    fs.writeFileSync(
      config.apiJsonFilePath,
      content.replace(new RegExp(pkg.name, 'g'), pkg.rewriteName),
    );
  }
}

function filterMembersForAngularThetaChar(members: ApiMember[]): ApiMember[] {
  return members.reduce((acc, member) => {
    if (member.name && member.name.startsWith(ANGULAR_THETA_CHAR)) {
      return acc;
    }

    return [
      ...acc,
      {
        ...member,
        members: member.members
          ? filterMembersForAngularThetaChar(member.members)
          : undefined,
      },
    ];
  }, [] as ApiMember[]);
}

async function rollupApiReport(pkg: ApiPackage): Promise<ApiReport> {
  const tsdocConfig = loadTsDocConfig();
  const apiReportPath = path.join(
    MONOREPO_ROOT,
    `dist/reports/${pkg.alias}.api.json`,
  );
  const apiReport: ApiMember = JSON.parse(
    fs.readFileSync(apiReportPath, 'utf-8'),
  );

  function buildInstrumentedFromExcerptTokens(
    excerptTokens: ApiMember['excerptTokens'],
  ): {
    instrumented: string;
    idToRef: Map<number, CanonicalReference>;
  } {
    const idToRef = new Map<number, CanonicalReference>();
    let idCounter = 0;
    let result = '';

    for (const t of excerptTokens ?? []) {
      if (t.kind === ApiExcerptTokenKind.Reference) {
        // Always mark references so we can track spans post-formatting,
        // but only map IDs to references that have a valid kind suffix (":...")
        result += `/*@hb:s:${idCounter}*/${t.text}/*@hb:e:${idCounter}*/`;
        const ref = (t as { canonicalReference?: CanonicalReference })
          .canonicalReference as string | undefined;
        if (ref && ref.includes(':')) {
          idToRef.set(idCounter, ref as CanonicalReference);
        }
        idCounter++;
      } else {
        result += t.text;
      }
    }

    return { instrumented: result, idToRef };
  }

  async function formatWithPrettier(code: string): Promise<string> {
    try {
      return await prettier.format(code, {
        parser: 'typescript',
        printWidth: 80,
      });
    } catch {
      return code;
    }
  }

  function dedent(body: string): string {
    const lines = body.split(/\r?\n/);
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const minIndent = nonEmpty.reduce(
      (min, line) => {
        const match = line.match(/^\s*/);
        const indent = match ? match[0].length : 0;
        return min === null ? indent : Math.min(min, indent);
      },
      null as number | null,
    );
    if (minIndent && minIndent > 0) {
      return lines
        .map((l) =>
          l.startsWith(' '.repeat(minIndent)) ? l.slice(minIndent) : l,
        )
        .join('\n')
        .trim();
    }
    return body.trim();
  }

  function extractClassBody(formattedClass: string): string {
    const openIndex = formattedClass.indexOf('{');
    const closeIndex = formattedClass.lastIndexOf('}');
    if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
      return formattedClass.trim();
    }
    const inner = formattedClass.slice(openIndex + 1, closeIndex);
    return dedent(inner);
  }

  function stripMarkers(s: string): string {
    return s.replace(/\/\*@hb:(?:s|e):\d+\*\//g, '');
  }

  function buildOverlayTokensFromMarkers(
    formattedWithMarkers: string,
    idToRef: Map<number, CanonicalReference>,
  ): { overlayTokens: ApiExcerptToken[]; formattedContent: string } {
    const startRe = /\/\*@hb:s:(\d+)\*\//g;
    const endRe = /\/\*@hb:e:(\d+)\*\//g;

    const tokens: ApiExcerptToken[] = [];
    let cursor = 0;
    while (cursor < formattedWithMarkers.length) {
      startRe.lastIndex = cursor;
      const s = startRe.exec(formattedWithMarkers);
      if (!s) {
        if (cursor < formattedWithMarkers.length) {
          tokens.push({
            kind: ApiExcerptTokenKind.Content,
            text: formattedWithMarkers.slice(cursor),
          });
        }
        break;
      }

      const startIdx = s.index;
      const id = Number(s[1]);

      if (startIdx > cursor) {
        tokens.push({
          kind: ApiExcerptTokenKind.Content,
          text: formattedWithMarkers.slice(cursor, startIdx),
        });
      }

      endRe.lastIndex = startRe.lastIndex;
      const e = endRe.exec(formattedWithMarkers);
      if (!e) {
        // Unbalanced markers; treat remainder as content
        tokens.push({
          kind: ApiExcerptTokenKind.Content,
          text: formattedWithMarkers.slice(startIdx),
        });
        break;
      }

      const innerStart = startRe.lastIndex;
      const innerEnd = e.index;
      const innerText = formattedWithMarkers.slice(innerStart, innerEnd);

      const ref = idToRef.get(id);
      if (ref) {
        tokens.push({
          kind: ApiExcerptTokenKind.Reference,
          text: innerText,
          canonicalReference: ref,
        });
      } else {
        // Fallback as content if mapping missing
        tokens.push({
          kind: ApiExcerptTokenKind.Content,
          text: innerText,
        });
      }

      cursor = endRe.lastIndex;
    }

    const formattedContent = stripMarkers(formattedWithMarkers);
    return { overlayTokens: tokens, formattedContent };
  }

  async function computeFormattedContentAndOverlayTokens(
    apiMember: ApiMember,
  ): Promise<{ formattedContent: string; overlayTokens: ApiExcerptToken[] }> {
    if (!apiMember || !apiMember.excerptTokens) {
      return { formattedContent: '', overlayTokens: [] };
    }

    const { instrumented, idToRef } = buildInstrumentedFromExcerptTokens(
      apiMember.excerptTokens,
    );
    const kind = apiMember.kind;

    if (!instrumented || instrumented.trim().length === 0) {
      return { formattedContent: '', overlayTokens: [] };
    }

    if (kind === 'Method' || kind === 'Property') {
      const wrapped = `declare class __HBW {\n${instrumented}\n}`;
      const formattedWrapped = await formatWithPrettier(wrapped);
      const innerWithMarkers = extractClassBody(formattedWrapped);
      return buildOverlayTokensFromMarkers(innerWithMarkers, idToRef);
    }

    const formatted = (await formatWithPrettier(instrumented)).trim();
    return buildOverlayTokensFromMarkers(formatted, idToRef);
  }

  async function recursivelyParseDocs(apiMember: ApiMember): Promise<void> {
    apiMember.docs = parseTSDoc(apiMember.docComment ?? '', tsdocConfig);
    const { formattedContent, overlayTokens } =
      await computeFormattedContentAndOverlayTokens(apiMember);
    apiMember.formattedContent = formattedContent;
    apiMember.overlayTokens = overlayTokens;

    if (apiMember.members) {
      for (const member of apiMember.members) {
        await recursivelyParseDocs(member);
      }
    }
  }

  await recursivelyParseDocs(apiReport);

  const entryPoint = apiReport.members?.find(
    (member) => member.kind === 'EntryPoint',
  );

  const symbols = new Map<string, ApiMember[]>();
  const members = filterMembersForAngularThetaChar(entryPoint?.members ?? []);

  members.forEach((member) => {
    if (!symbols.has(member.name)) {
      symbols.set(member.name, []);
    }

    symbols.get(member.name)?.push(member);
  });

  return {
    symbolNames: Array.from(symbols.keys()),
    symbols: Array.from(symbols.entries()).reduce(
      (acc, [name, members]): Record<string, ApiMemberSummary> => {
        const firstMember = members[0];
        const [simplifiedReference] = firstMember.canonicalReference.split('(');
        const isDeprecated = members.every((member) => member.docs.deprecated);

        return {
          ...acc,
          [name]: {
            name,
            canonicalReference: simplifiedReference as CanonicalReference,
            kind: firstMember.kind,
            fileUrlPath: firstMember.fileUrlPath,
            isDeprecated,
            members,
          },
        };
      },
      {},
    ),
  };
}

function renderDocNode(annotation: string, docNode?: DocNode): string {
  let result = '';
  if (docNode) {
    if (docNode instanceof DocExcerpt) {
      result += docNode.content.toString();
    }
    for (const childNode of docNode.getChildNodes()) {
      result += renderDocNode(annotation, childNode);
    }
  }
  return result.replace(annotation, '');
}

function parseTSDoc(
  foundComment: string,
  configuration?: TSDocConfiguration,
): ApiDocs {
  const customConfiguration = configuration || new TSDocConfiguration();

  const tsdocParser = new TSDocParser(customConfiguration);
  const parserContext = tsdocParser.parseString(foundComment);
  const docComment = parserContext.docComment;
  const usageNotesBlock = docComment.customBlocks.find(
    (block) => block.blockTag.tagName === '@usageNotes',
  );

  return {
    modifiers: {
      isInternal: docComment.modifierTagSet.isInternal(),
      isPublic: docComment.modifierTagSet.isPublic(),
      isAlpha: docComment.modifierTagSet.isAlpha(),
      isBeta: docComment.modifierTagSet.isBeta(),
      isOverride: docComment.modifierTagSet.isOverride(),
      isExperimental: docComment.modifierTagSet.isExperimental(),
    },
    summary: renderDocNode('@description', docComment.summarySection),
    usageNotes: renderDocNode('@usageNotes', usageNotesBlock),
    remarks: renderDocNode('@remarks', docComment.remarksBlock),
    deprecated: renderDocNode('@deprecated', docComment.deprecatedBlock),
    returns: renderDocNode('@returns', docComment.returnsBlock),
    see: docComment.seeBlocks.map((block) => renderDocNode('@see', block)),
    params: docComment.params.blocks.map((block) => ({
      name: block.parameterName,
      description: renderDocNode('@param', block.content),
    })),
    examples: docComment.customBlocks
      .filter((block) => block.blockTag.tagName === '@example')
      .map((block) => renderDocNode('@example', block)),
  };
}

async function parsePackages(): Promise<ApiPackageReport> {
  PACKAGES_TO_PARSE.forEach((pkg) => createApiReport(pkg));

  const entries = await Promise.all(
    PACKAGES_TO_PARSE.map(
      async (pkg) =>
        [pkg.rewriteName ?? pkg.name, await rollupApiReport(pkg)] as const,
    ),
  );

  const packages = Object.fromEntries(entries) as Record<string, ApiReport>;
  const packageNames = Object.keys(packages);

  return { packageNames, packages };
}

function minimizeApiReport(
  apiReport: ApiPackageReport,
): MinimizedApiPackageReport {
  const packages = apiReport.packageNames.reduce(
    (acc, packageName): Record<string, MinimizedApiReport> => {
      const { symbols, symbolNames } = apiReport.packages[packageName];

      const minimalSymbols = symbolNames.map(
        (symbolName): MinimizedApiMemberSummary => {
          const symbol = symbols[symbolName];

          return {
            kind: symbol.kind,
            name: symbol.name,
            canonicalReference: symbol.canonicalReference,
            isDeprecated: symbol.isDeprecated,
          };
        },
      );

      return {
        ...acc,
        [packageName]: {
          symbolNames,
          symbols: minimalSymbols.reduce(
            (acc, symbol): Record<string, MinimizedApiMemberSummary> => {
              return {
                ...acc,
                [symbol.name]: symbol,
              };
            },
            {} as Record<string, MinimizedApiMemberSummary>,
          ),
        },
      };
    },
    {} as Record<string, MinimizedApiReport>,
  );

  return { packageNames: apiReport.packageNames, packages };
}

async function writeFinalizedApiReport() {
  const report = await parsePackages();
  const minimizedReport = minimizeApiReport(report);

  const minimizedReportPath = path.join(
    MONOREPO_ROOT,
    './www/src/app/reference/api-report.min.json',
  );

  for (const packageName of report.packageNames) {
    const packageReport = report.packages[packageName];
    const [, ...packagePath] = packageName.split('/');

    for (const symbolName of packageReport.symbolNames) {
      const symbol = packageReport.symbols[symbolName];
      const basePath = path.join(MONOREPO_ROOT, `./www/src/app/reference`);

      packagePath.forEach((dir, index) => {
        const previousPath = path.join(
          basePath,
          ...packagePath.slice(0, index),
        );
        const currentPath = path.join(previousPath, dir);

        if (!fs.existsSync(currentPath)) {
          fs.mkdirSync(currentPath);
        }
      });

      const symbolPath = path.join(
        MONOREPO_ROOT,
        `./www/src/app/reference/${packagePath.join('/')}/${symbol.name}.json`,
      );

      fs.writeFileSync(symbolPath, JSON.stringify(symbol));
    }
  }

  fs.writeFileSync(minimizedReportPath, JSON.stringify(minimizedReport));
}

await writeFinalizedApiReport();
