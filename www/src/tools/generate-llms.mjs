import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve key paths relative to this file to avoid relying on process.cwd()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..'); // www/
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');
let DOCS_ROOT = path.resolve(PROJECT_ROOT, 'src/app/pages/docs');

// Default output directory when not provided via CLI args
const DEFAULT_OUTPUT_DIR = path.resolve(WORKSPACE_ROOT, 'dist/www/client');
// Default output directory when not provided via CLI args
let BASE_URL = 'https://hashbrown.dev';

function parseArgs(argv) {
  const args = {};
  const tokens = [...argv];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('--')) continue;

    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      const key = token.slice(2, eqIndex);
      const value = token.slice(eqIndex + 1);
      args[key] = value;
      continue;
    }

    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }

  return args;
}

const DOC_SECTIONS = [
  { label: 'React Documentation', slug: 'react' },
  { label: 'Angular Documentation', slug: 'angular' },
];

function parseMarkdown(content) {
  const normalized = content.replace(/\r\n?/g, '\n');

  if (!normalized.startsWith('---\n')) {
    return { attributes: {}, body: normalized }; // no frontmatter present
  }

  const closingIndex = normalized.indexOf('\n---', 4);

  if (closingIndex === -1) {
    return { attributes: {}, body: normalized };
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const bodyStart = closingIndex + 4;
  const body = normalized.slice(bodyStart).replace(/^\n+/, '');

  let title;
  const titleMatch = frontmatterBlock.match(/^title:\s*(.*)$/m);

  if (titleMatch) {
    title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
  }

  return { attributes: { title }, body };
}

async function readDirectoryRecursively(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return readDirectoryRecursively(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
    }),
  );

  return results.flat();
}

function toUrl(slug, absolutePath) {
  const sectionRoot = path.join(DOCS_ROOT, slug);
  const relativePath = path
    .relative(sectionRoot, absolutePath)
    .replace(/\\/g, '/');
  let urlPath = relativePath.replace(/\.md$/i, '');

  if (urlPath.endsWith('/index')) {
    urlPath = urlPath.slice(0, -'/index'.length);
  }

  if (!urlPath) {
    return `${BASE_URL}/docs/${slug}`;
  }

  return `${BASE_URL}/docs/${slug}/${urlPath}`;
}

function resolveDocLink(link, slug) {
  if (!link) {
    return '';
  }

  if (/^https?:/i.test(link)) {
    return link;
  }

  try {
    const base = `${BASE_URL}/docs/${slug}/`;
    return new URL(link, base).toString();
  } catch (error) {
    console.warn(
      `Unable to resolve next-step link "${link}" for ${slug}:`,
      error,
    );
    return link;
  }
}

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function transformNextSteps(content, slug) {
  return content.replace(
    /<hb-next-step\s+link="([^"]+)"[^>]*>([\s\S]*?)<\/hb-next-step>/g,
    (match, link, inner) => {
      const titleMatch = inner.match(/<h[34][^>]*>([\s\S]*?)<\/h[34]>/i);
      const descriptionMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

      const title = titleMatch ? stripHtml(titleMatch[1]) : 'Next Step';
      const description = descriptionMatch
        ? stripHtml(descriptionMatch[1])
        : undefined;
      const resolvedLink = resolveDocLink(link.trim(), slug);

      const base = resolvedLink ? `[${title}](${resolvedLink})` : title;
      return description ? `- ${base} — ${description}` : `- ${base}`;
    },
  );
}

function transformDocBody(body, slug) {
  let content = body.replace(/\r\n?/g, '\n');

  content = content.replace(
    /<p\s+class="subtitle">([\s\S]*?)<\/p>/g,
    (_, text) => `${stripHtml(text)}\n\n`,
  );

  content = content.replace(
    /<hb-code-example\s+[^>]*header="([^"]+)"[^>]*>\s*/g,
    (_, header) => `**Example (${header.trim()}):**\n\n`,
  );

  content = content.replace(/<\/hb-code-example>\s*/g, '\n');

  content = content.replace(
    /<hb-expander\s+title="([^"]+)"[^>]*>\s*/g,
    (_, title) => `### ${title.trim()}\n\n`,
  );

  content = content.replace(/<\/hb-expander>\s*/g, '\n');

  content = transformNextSteps(content, slug)
    .replace(/<hb-next-steps>/g, '')
    .replace(/<\/hb-next-steps>/g, '');

  content = content.replace(
    /<iframe[^>]*src="([^"]+)"[^>]*>[\s\S]*?<\/iframe>/g,
    (_, src) => `*(Demo video: ${src})*`,
  );

  content = content.replace(/<\/div>/g, '\n');
  content = content.replace(/<div[^>]*>/g, '\n');

  content = content.replace(/<hb-[a-z-]+[^>]*\/>/g, '');
  content = content.replace(/<\/hb-[a-z-]+>/g, '');
  content = content.replace(/<hb-[a-z-]+[^>]*>/g, '');

  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.replace(/^[ \t]+- /gm, '- ');

  return decodeEntities(content).trim();
}

async function buildSectionLinks({ slug }) {
  const sectionDir = path.join(DOCS_ROOT, slug);
  const markdownFiles = await readDirectoryRecursively(sectionDir);

  const links = [];

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, 'utf8');
    const { attributes } = parseMarkdown(content);

    if (!attributes?.title) {
      console.warn(`Skipping ${filePath} because it is missing a title.`);
      continue;
    }

    links.push({
      title: attributes.title,
      url: toUrl(slug, filePath),
    });
  }

  return links.sort((a, b) => a.title.localeCompare(b.title));
}

async function buildLlmsFile(outputDir) {
  const sectionsWithLinks = await Promise.all(
    DOC_SECTIONS.map(async (section) => ({
      ...section,
      links: await buildSectionLinks(section),
    })),
  );

  const lines = [
    '# Hashbrown',
    '',
    '> Hashbrown is a TypeScript framework for building generative user interfaces that converse with users, dynamically reorganize, and even code themselves.',
    '',
  ];

  for (const section of sectionsWithLinks) {
    lines.push(`## ${section.label}`, '');

    if (!section.links.length) {
      lines.push('- _(No documentation found)_', '');
      continue;
    }

    for (const link of section.links) {
      lines.push(`- [${link.title}](${link.url})`);
    }

    lines.push('');
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'llms.txt'), lines.join('\n'));
}

async function collectDocsForSection(section) {
  const sectionDir = path.join(DOCS_ROOT, section.slug);
  const markdownFiles = await readDirectoryRecursively(sectionDir);
  markdownFiles.sort((a, b) => a.localeCompare(b));

  const docs = [];

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, 'utf8');
    const parsed = parseMarkdown(content);
    const transformed = transformDocBody(parsed.body, section.slug);

    if (!transformed) {
      continue;
    }

    docs.push(transformed);
  }

  return docs;
}

async function buildLlmsFullFile(outputDir) {
  const lines = ['# Hashbrown Documentation', ''];

  for (const section of DOC_SECTIONS) {
    lines.push(`## ${section.label}`, '');

    const docs = await collectDocsForSection(section);

    docs.forEach((doc, index) => {
      lines.push(doc.trim());

      if (index < docs.length - 1) {
        lines.push('', '---', '');
      } else {
        lines.push('');
      }
    });

    while (lines.length && lines[lines.length - 1] === '') {
      lines.pop();
    }

    lines.push('');
  }

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, 'llms-full.txt'),
    `${lines.join('\n')}\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.baseUrl || args['base-url']) {
    BASE_URL = String(args.baseUrl ?? args['base-url']);
  }

  if (args.docsRoot || args['docs-root']) {
    const provided = String(args.docsRoot ?? args['docs-root']);
    DOCS_ROOT = path.isAbsolute(provided)
      ? provided
      : path.resolve(WORKSPACE_ROOT, provided);
  }

  const outputDirArg = args.outputDir ?? args['output-dir'];
  const outputDir = outputDirArg
    ? path.isAbsolute(String(outputDirArg))
      ? String(outputDirArg)
      : path.resolve(WORKSPACE_ROOT, String(outputDirArg))
    : DEFAULT_OUTPUT_DIR;

  await Promise.all([buildLlmsFile(outputDir), buildLlmsFullFile(outputDir)]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
