# Documentation application snippets

Run from the workspace root:

```sh
node --import tsx www/src/tools/check-docs-examples.ts
```

The same command is available as the `www:check-docs-examples` Nx target.

The checker extracts actual TypeScript/TSX fences before each page's
`## Explore it in the workbench` section. It checks imported modules in both
frameworks' concept pages, the model-selection and prompt-engineering guides,
and `start/how-it-works`. The shared `supportInstructions` constant is extracted
as `support-instructions.ts`; divergent copies fail.

The recipe manifest names the newly added ordinary application examples. Every
TypeScript/TSX fence before the workbench section is included. A changed snippet
count fails until the manifest is updated. Each recipe gets a separate directory.
The manifest gives the shopping schema and trip validator their documented
filenames so relative imports resolve without substitutions.

The tool compiles the extracted text directly, without copied implementations,
API stubs, or prose snapshots. Public imports resolve through the workspace's
actual package exports and `tsconfig.base.json` paths. Angular's compiler checks
both frameworks' TypeScript and additionally checks Angular templates with
`strictTemplates`.

Generated files live in a unique workspace `tmp` directory for normal dependency
resolution and are removed after success or failure. No compiler files are emitted.
The extractor's unit tests cover the workbench boundary, adjacent imports, changed
fence counts, and shared-module consistency.

The existing local-model and Threadplane recipes retain their separately checked
standalone implementations and are outside this manifest's newly authored recipe
scope. No inference, provider calls, browser downloads, or complete application
build is needed for this check.
