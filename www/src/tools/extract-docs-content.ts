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
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from '@microsoft/tsdoc';
import fs from 'fs';
import path from 'path';
import {
  ApiDocs,
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

function rollupApiReport(pkg: ApiPackage): ApiReport {
  const apiReportPath = path.join(
    MONOREPO_ROOT,
    `dist/reports/${pkg.alias}.api.json`,
  );
  const apiReport: ApiMember = JSON.parse(
    fs.readFileSync(apiReportPath, 'utf-8'),
  );

  function recursivelyParseDocs(apiMember: ApiMember) {
    apiMember.docs = parseTSDoc(apiMember.docComment ?? '');

    if (apiMember.members) {
      apiMember.members.forEach((member) => recursivelyParseDocs(member));
    }
  }

  recursivelyParseDocs(apiReport);

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

function parseTSDoc(foundComment: string): ApiDocs {
  const customConfiguration = new TSDocConfiguration();
  const usageNotesDefinition = new TSDocTagDefinition({
    tagName: '@usageNotes',
    syntaxKind: TSDocTagSyntaxKind.BlockTag,
  });

  customConfiguration.addTagDefinitions([usageNotesDefinition]);

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

function parsePackages(): ApiPackageReport {
  PACKAGES_TO_PARSE.forEach((pkg) => createApiReport(pkg));

  const packages = PACKAGES_TO_PARSE.reduce(
    (acc, pkg) => ({
      ...acc,
      [pkg.rewriteName ?? pkg.name]: rollupApiReport(pkg),
    }),
    {} as Record<string, ApiReport>,
  );
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

function writeFinalizedApiReport() {
  const report = parsePackages();
  const minimizedReport = minimizeApiReport(report);

  const minimizedReportPath = path.join(
    MONOREPO_ROOT,
    './www/src/app/reference/api-report.min.json',
  );

  for (const packageName of report.packageNames) {
    const packageReport = report.packages[packageName];
    const [hashbrownai, ...packagePath] = packageName.split('/');

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

writeFinalizedApiReport();
