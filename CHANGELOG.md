## 0.5.0-beta.3 (2026-02-12)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in  www  #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular:** Add support for standard JSON schema in tools, structured outputs, and component inputs ([97293f2](https://github.com/liveloveapp/project-cassini/commit/97293f2))
- **angular:** add injectJsonParser ([f8e90f3](https://github.com/liveloveapp/project-cassini/commit/f8e90f3))
- **angular:** consume ui wrapper schema ([e1729a1](https://github.com/liveloveapp/project-cassini/commit/e1729a1))
- **angular:** add dedicated magic text citation render directive ([9676247](https://github.com/liveloveapp/project-cassini/commit/9676247))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core:** Add AST-level streaming JSON parser ([15b8050](https://github.com/liveloveapp/project-cassini/commit/15b8050))
- **core:** Add fromJsonAst to resolve streaming values ([568acab](https://github.com/liveloveapp/project-cassini/commit/568acab))
- **core:** Add constraints for strings, numbers, and arrays in Skillet ([c8b1c1d](https://github.com/liveloveapp/project-cassini/commit/c8b1c1d))
- **core:** Convert standard JSON schema into Skillet schema ([5d24ace](https://github.com/liveloveapp/project-cassini/commit/5d24ace))
- **core:** return wrapper ui schema and examples ([d51673a](https://github.com/liveloveapp/project-cassini/commit/d51673a))
- **core:** Rebuild Magic Text as a full Markdown parser ([c43563d](https://github.com/liveloveapp/project-cassini/commit/c43563d))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,angular,react:** Add ability to specify fallback components during generation ([4c72cf5](https://github.com/liveloveapp/project-cassini/commit/4c72cf5))
- **core,angular,react:** Add UI kits for schema composition ([5a05428](https://github.com/liveloveapp/project-cassini/commit/5a05428))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **fast-food-angular:** migrate chat kit to markdown citation definitions ([ca9fe94](https://github.com/liveloveapp/project-cassini/commit/ca9fe94))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **google:** Preserve thought signatures for tool calls ([c3a8528](https://github.com/liveloveapp/project-cassini/commit/c3a8528))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **react:** Add support for standard JSON schema in tools, structured outputs, and component props ([841172f](https://github.com/liveloveapp/project-cassini/commit/841172f))
- **react:** add useJsonParser hook ([47ccd1c](https://github.com/liveloveapp/project-cassini/commit/47ccd1c))
- **react:** consume ui wrapper schema ([276fe5d](https://github.com/liveloveapp/project-cassini/commit/276fe5d))
- **react:** Expose Magic Text renderer ([a161a6f](https://github.com/liveloveapp/project-cassini/commit/a161a6f))
- **react,angular:** add prop-driven json parser APIs ([d187026](https://github.com/liveloveapp/project-cassini/commit/d187026))
- **renderers:** add default segment fade and citation badge styles ([70a9819](https://github.com/liveloveapp/project-cassini/commit/70a9819))
- **renderers:** slow default segment fade to 400ms ([efc6fbb](https://github.com/liveloveapp/project-cassini/commit/efc6fbb))
- **renderers:** open default links and citations in new tab ([2d16efa](https://github.com/liveloveapp/project-cassini/commit/2d16efa))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **angular:** Support standard JSON schema for component inputs ([4341163](https://github.com/liveloveapp/project-cassini/commit/4341163))
- **angular:** validate only complete ui nodes ([e586725](https://github.com/liveloveapp/project-cassini/commit/e586725))
- **angular:** stabilize renderable injector reuse by tag ([c695928](https://github.com/liveloveapp/project-cassini/commit/c695928))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core:** initialize streaming keys in objects ([049553b](https://github.com/liveloveapp/project-cassini/commit/049553b))
- **core:** allow streaming object validation to skip missing keys ([ffdeed8](https://github.com/liveloveapp/project-cassini/commit/ffdeed8))
- **core:** validate unknown keys in object schemas ([9f1f2a8](https://github.com/liveloveapp/project-cassini/commit/9f1f2a8))
- **core:** consume hard-break backslash in inline parser ([94f4c11](https://github.com/liveloveapp/project-cassini/commit/94f4c11))
- **core:** parse blockquote bodies as nested blocks ([f387bf5](https://github.com/liveloveapp/project-cassini/commit/f387bf5))
- **core:** add no-break segment hints for citation punctuation ([ed6b297](https://github.com/liveloveapp/project-cassini/commit/ed6b297))
- **core:** optimistically parse unfinished inline citations ([97f404a](https://github.com/liveloveapp/project-cassini/commit/97f404a))
- **core:** validate node props from authored prompt values ([7b2d090](https://github.com/liveloveapp/project-cassini/commit/7b2d090))
- **core:** preserve streaming parser partial values ([646419d](https://github.com/liveloveapp/project-cassini/commit/646419d))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **ollama:** Restore support for Ollama JSON streaming ([4b307e3](https://github.com/liveloveapp/project-cassini/commit/4b307e3))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **react:** Wait until a node is renderable before validating ([2b86a48](https://github.com/liveloveapp/project-cassini/commit/2b86a48))
- **renderers:** prevent citation punctuation wraps and root-level caret ([446a8cd](https://github.com/liveloveapp/project-cassini/commit/446a8cd))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/smart-home:** Revert to gpt-5.1 for the model ([970a014](https://github.com/liveloveapp/project-cassini/commit/970a014))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **spotify-server:** resolve mcp tool schema typing ([017a5b0](https://github.com/liveloveapp/project-cassini/commit/017a5b0))
- **writer:** Correctly handle the output tool call when SO is emulated ([df0c8b3](https://github.com/liveloveapp/project-cassini/commit/df0c8b3))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.5.0-beta.2 (2026-01-28)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in  www  #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular:** Add support for standard JSON schema in tools, structured outputs, and component inputs ([97293f2](https://github.com/liveloveapp/project-cassini/commit/97293f2))
- **angular:** add injectJsonParser ([f8e90f3](https://github.com/liveloveapp/project-cassini/commit/f8e90f3))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core:** Add AST-level streaming JSON parser ([15b8050](https://github.com/liveloveapp/project-cassini/commit/15b8050))
- **core:** Add fromJsonAst to resolve streaming values ([568acab](https://github.com/liveloveapp/project-cassini/commit/568acab))
- **core:** Add constraints for strings, numbers, and arrays in Skillet ([c8b1c1d](https://github.com/liveloveapp/project-cassini/commit/c8b1c1d))
- **core:** Convert standard JSON schema into Skillet schema ([5d24ace](https://github.com/liveloveapp/project-cassini/commit/5d24ace))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,angular,react:** Add ability to specify fallback components during generation ([4c72cf5](https://github.com/liveloveapp/project-cassini/commit/4c72cf5))
- **core,angular,react:** Add UI kits for schema composition ([5a05428](https://github.com/liveloveapp/project-cassini/commit/5a05428))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **google:** Preserve thought signatures for tool calls ([c3a8528](https://github.com/liveloveapp/project-cassini/commit/c3a8528))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **react:** Add support for standard JSON schema in tools, structured outputs, and component props ([841172f](https://github.com/liveloveapp/project-cassini/commit/841172f))
- **react:** add useJsonParser hook ([47ccd1c](https://github.com/liveloveapp/project-cassini/commit/47ccd1c))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **angular:** Support standard JSON schema for component inputs ([4341163](https://github.com/liveloveapp/project-cassini/commit/4341163))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core:** initialize streaming keys in objects ([049553b](https://github.com/liveloveapp/project-cassini/commit/049553b))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **ollama:** Restore support for Ollama JSON streaming ([4b307e3](https://github.com/liveloveapp/project-cassini/commit/4b307e3))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **react:** Wait until a node is renderable before validating ([36a76cd](https://github.com/liveloveapp/project-cassini/commit/36a76cd))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/smart-home:** Revert to gpt-5.1 for the model ([970a014](https://github.com/liveloveapp/project-cassini/commit/970a014))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **spotify-server:** resolve mcp tool schema typing ([017a5b0](https://github.com/liveloveapp/project-cassini/commit/017a5b0))
- **writer:** Correctly handle the output tool call when SO is emulated ([df0c8b3](https://github.com/liveloveapp/project-cassini/commit/df0c8b3))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.5.0-beta.1 (2026-01-27)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in  www  #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular:** Add support for standard JSON schema in tools, structured outputs, and component inputs ([97293f2](https://github.com/liveloveapp/project-cassini/commit/97293f2))
- **angular:** add injectJsonParser ([f8e90f3](https://github.com/liveloveapp/project-cassini/commit/f8e90f3))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core:** Add AST-level streaming JSON parser ([15b8050](https://github.com/liveloveapp/project-cassini/commit/15b8050))
- **core:** Add fromJsonAst to resolve streaming values ([568acab](https://github.com/liveloveapp/project-cassini/commit/568acab))
- **core:** Add constraints for strings, numbers, and arrays in Skillet ([c8b1c1d](https://github.com/liveloveapp/project-cassini/commit/c8b1c1d))
- **core:** Convert standard JSON schema into Skillet schema ([5d24ace](https://github.com/liveloveapp/project-cassini/commit/5d24ace))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,angular,react:** Add ability to specify fallback components during generation ([4c72cf5](https://github.com/liveloveapp/project-cassini/commit/4c72cf5))
- **core,angular,react:** Add UI kits for schema composition ([5a05428](https://github.com/liveloveapp/project-cassini/commit/5a05428))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **google:** Preserve thought signatures for tool calls ([c3a8528](https://github.com/liveloveapp/project-cassini/commit/c3a8528))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **react:** Add support for standard JSON schema in tools, structured outputs, and component props ([841172f](https://github.com/liveloveapp/project-cassini/commit/841172f))
- **react:** add useJsonParser hook ([47ccd1c](https://github.com/liveloveapp/project-cassini/commit/47ccd1c))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **angular:** Support standard JSON schema for component inputs ([4341163](https://github.com/liveloveapp/project-cassini/commit/4341163))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core:** initialize streaming keys in objects ([049553b](https://github.com/liveloveapp/project-cassini/commit/049553b))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **ollama:** Restore support for Ollama JSON streaming ([4b307e3](https://github.com/liveloveapp/project-cassini/commit/4b307e3))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/smart-home:** Revert to gpt-5.1 for the model ([970a014](https://github.com/liveloveapp/project-cassini/commit/970a014))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **spotify-server:** resolve mcp tool schema typing ([017a5b0](https://github.com/liveloveapp/project-cassini/commit/017a5b0))
- **writer:** Correctly handle the output tool call when SO is emulated ([df0c8b3](https://github.com/liveloveapp/project-cassini/commit/df0c8b3))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.4.1 (2025-12-17)

This was a version bump only, there were no code changes.

## 0.4.1-alpha.2 (2025-12-17)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in  www  #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/smart-home:** Revert to gpt-5.1 for the model ([970a014](https://github.com/liveloveapp/project-cassini/commit/970a014))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.4.1-alpha.1 (2025-12-17)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in www #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/smart-home:** Revert to gpt-5.1 for the model ([970a014](https://github.com/liveloveapp/project-cassini/commit/970a014))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.4.0 (2025-12-16)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in www #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular:** Add built-in Magic Text renderer ([22f2b4f](https://github.com/liveloveapp/project-cassini/commit/22f2b4f))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **bedrock:** Add Bedrock adapter package ([#426](https://github.com/liveloveapp/project-cassini/pull/426))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core:** add optional thread ID message handling ([#407](https://github.com/liveloveapp/project-cassini/pull/407))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,angular,react:** Add support for Chrome's local models ([894f5ed](https://github.com/liveloveapp/project-cassini/commit/894f5ed))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **react:** Add emulateStructuredOutput to React API ([#427](https://github.com/liveloveapp/project-cassini/pull/427))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))
- **www:** Add Hashy Skates animation ([52e4442](https://github.com/liveloveapp/project-cassini/commit/52e4442))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.4.1-alpha.1 (2025-11-18)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in www #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular:** Add uiCompletionResource ([29f28fc](https://github.com/liveloveapp/project-cassini/commit/29f28fc))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core:** Improve citations support for Magic Text ([6978c5e](https://github.com/liveloveapp/project-cassini/commit/6978c5e))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **react:** Add useUICompletion hook ([2d08ffc](https://github.com/liveloveapp/project-cassini/commit/2d08ffc))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **samples/finance:** Consume the updated magic text parser ([14a4114](https://github.com/liveloveapp/project-cassini/commit/14a4114))
- **samples/finance:** Stub out citation support, and improve visuals ([3546b36](https://github.com/liveloveapp/project-cassini/commit/3546b36))
- **samples/finance:** Improve polish of citations ([bbf7c12](https://github.com/liveloveapp/project-cassini/commit/bbf7c12))
- **samples/finance:** Improve quality of magic text rendering ([dc8156a](https://github.com/liveloveapp/project-cassini/commit/dc8156a))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core:** Add explicit export settings so that the 'import' entrypoint will resolve ([#419](https://github.com/liveloveapp/project-cassini/issues/419))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO @NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.4.0-rc.0 (2025-11-14)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in www #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- Add anthropic adapter ([#282](https://github.com/liveloveapp/project-cassini/pull/282), [#349](https://github.com/liveloveapp/project-cassini/pull/349))
- allow compatibility with prerelease versions (v21) of Angular ([#382](https://github.com/liveloveapp/project-cassini/pull/382))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular:** add deep signals for structured output resources ([#360](https://github.com/liveloveapp/project-cassini/pull/360), [#112](https://github.com/liveloveapp/project-cassini/issues/112))
- **angular:** expose resource state signals ([8367410](https://github.com/liveloveapp/project-cassini/commit/8367410))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **anthropic:** improve streaming tool support ([394f1b3](https://github.com/liveloveapp/project-cassini/commit/394f1b3))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core:** add magic text parser and streaming fixes ([2892ad5](https://github.com/liveloveapp/project-cassini/commit/2892ad5))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **samples:** smart home theme ([#343](https://github.com/liveloveapp/project-cassini/pull/343))
- **samples:** AWS Lambda streaming sample "server" ([#408](https://github.com/liveloveapp/project-cassini/pull/408))
- **samples/finance:** add themed chat experience ([1d91fae](https://github.com/liveloveapp/project-cassini/commit/1d91fae))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** mcp fundamentals date ([#319](https://github.com/liveloveapp/project-cassini/pull/319))
- **www:** predictive actions ([#322](https://github.com/liveloveapp/project-cassini/pull/322))
- **www:** Add a feature list to the homepage ([b2e4c03](https://github.com/liveloveapp/project-cassini/commit/b2e4c03))
- **www:** Merge samples with docs on the homepage ([21cabbd](https://github.com/liveloveapp/project-cassini/commit/21cabbd))
- **www:** meta ([#344](https://github.com/liveloveapp/project-cassini/pull/344), [#309](https://github.com/liveloveapp/project-cassini/issues/309))
- **www:** examples ([#346](https://github.com/liveloveapp/project-cassini/pull/346))
- **www:** wdc announcement ([#350](https://github.com/liveloveapp/project-cassini/pull/350))
- **www:** responsive menu ([#353](https://github.com/liveloveapp/project-cassini/pull/353))
- **www:** wdc blog post ([#362](https://github.com/liveloveapp/project-cassini/pull/362))
- **www:** sample app overlay ([#363](https://github.com/liveloveapp/project-cassini/pull/363))
- **www:** llms.txt and more mobile improvements ([#365](https://github.com/liveloveapp/project-cassini/pull/365))
- **www:** mobile improvements ([#366](https://github.com/liveloveapp/project-cassini/pull/366))
- **www:** announcement for workshops ([#369](https://github.com/liveloveapp/project-cassini/pull/369))
- **www:** the gravy discount ([#370](https://github.com/liveloveapp/project-cassini/pull/370))
- **www:** search ([#373](https://github.com/liveloveapp/project-cassini/pull/373))
- **www:** header search ([#374](https://github.com/liveloveapp/project-cassini/pull/374))
- **www:** BackendCodeExample and docs updates ([280cb0a](https://github.com/liveloveapp/project-cassini/commit/280cb0a))
- **www:** toast notifications ([edf4312](https://github.com/liveloveapp/project-cassini/commit/edf4312))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- set workshop to inactive ([#320](https://github.com/liveloveapp/project-cassini/pull/320))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core:** prompt non-ui template expressions ([#372](https://github.com/liveloveapp/project-cassini/pull/372), [#371](https://github.com/liveloveapp/project-cassini/issues/371))
- **core:** Add gpt 5 models to known models list ([#397](https://github.com/liveloveapp/project-cassini/pull/397), [#396](https://github.com/liveloveapp/project-cassini/issues/396))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **google:** fix error when developer does not provide any tools ([#400](https://github.com/liveloveapp/project-cassini/pull/400), [#399](https://github.com/liveloveapp/project-cassini/issues/399))
- **ollama:** Add transformRequest option and remove the default thinking param ([#380](https://github.com/liveloveapp/project-cassini/issues/380))
- **openai:** Update OpenAI sdk version ([#387](https://github.com/liveloveapp/project-cassini/pull/387), [#385](https://github.com/liveloveapp/project-cassini/issues/385))
- **react:** resolve server sync external store state ([#404](https://github.com/liveloveapp/project-cassini/pull/404), [#403](https://github.com/liveloveapp/project-cassini/issues/403))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples:** finance data ([#355](https://github.com/liveloveapp/project-cassini/pull/355))
- **samples:** limit faker data ([#358](https://github.com/liveloveapp/project-cassini/pull/358))
- **samples:** roll back faker data ([#359](https://github.com/liveloveapp/project-cassini/pull/359))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **samples/spotify:** align mcp tool types ([c7dccdf](https://github.com/liveloveapp/project-cassini/commit/c7dccdf))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))
- **www:** Tighten up the docs typography ([fcf32f2](https://github.com/liveloveapp/project-cassini/commit/fcf32f2))
- **www:** generate llms after build ([#367](https://github.com/liveloveapp/project-cassini/pull/367))
- **www:** use markdown for encoding search data ([#375](https://github.com/liveloveapp/project-cassini/pull/375))
- **www:** squircle fallback ([#376](https://github.com/liveloveapp/project-cassini/pull/376))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO @NsdHSO
- adsuna @adsuna
- Anurag Pandey @Luvyansh
- Ben Taylor
- Brian Love @blove
- Donald Murillo @DonaldMurillo
- Jake Harris @jakeharris
- Jared Pleva
- Mike Ryan @MikeRyanDev
- Stephen Fluin
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.3.0 (2025-09-05)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- 🎸 context for webstorm in www #279 ([#292](https://github.com/liveloveapp/project-cassini/pull/292), [#279](https://github.com/liveloveapp/project-cassini/issues/279))
- Add experimental support for Ollama ([#295](https://github.com/liveloveapp/project-cassini/pull/295))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular:** Allow tools to be defined outside of a DI context ([#316](https://github.com/liveloveapp/project-cassini/pull/316))
- **angular,react:** expose lastAssistantMessage helper ([92498bf](https://github.com/liveloveapp/project-cassini/commit/92498bf))
- **angular,react:** Add support for the prompt function in UI chat ([#302](https://github.com/liveloveapp/project-cassini/pull/302))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core:** Use literals as the discriminator when available ([#285](https://github.com/liveloveapp/project-cassini/pull/285))
- **core:** Add prompt template literal tag function ([#294](https://github.com/liveloveapp/project-cassini/pull/294))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **react:** use tool with unknown schema ([#299](https://github.com/liveloveapp/project-cassini/pull/299))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))
- **www:** Implement redesign and improve documentation ([b186675](https://github.com/liveloveapp/project-cassini/commit/b186675))
- **www:** fredoka font and content updates ([#307](https://github.com/liveloveapp/project-cassini/pull/307))
- **www:** api docs ([#310](https://github.com/liveloveapp/project-cassini/pull/310), [#175](https://github.com/liveloveapp/project-cassini/issues/175))
- **www:** prompt tagged template literal, ollama, remote mcp with react ([#313](https://github.com/liveloveapp/project-cassini/pull/313), [#309](https://github.com/liveloveapp/project-cassini/issues/309))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **angular:** Correct type for uiChatResource's lastAssistantMessage ([9580a96](https://github.com/liveloveapp/project-cassini/commit/9580a96))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d11b22e](https://github.com/liveloveapp/project-cassini/commit/d11b22e))
- **core:** Omit enveloping keys from objects inside anyOfs ([#304](https://github.com/liveloveapp/project-cassini/pull/304))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **core,azure,openai,google,writer,angular:** handle non-string assistant content and sync options ([#288](https://github.com/liveloveapp/project-cassini/issues/288), [#289](https://github.com/liveloveapp/project-cassini/issues/289))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples:** Get sample server running again ([d134146](https://github.com/liveloveapp/project-cassini/commit/d134146))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))
- **www:** take year in copyright dinamically ([#278](https://github.com/liveloveapp/project-cassini/pull/278), [#276](https://github.com/liveloveapp/project-cassini/issues/276))

### ❤️ Thank You

- ( Nechiforel David-Samuel ) NsdHSO @NsdHSO
- Ben Taylor
- Brian Love @blove
- Jake Harris @jakeharris
- Mike Ryan @MikeRyanDev
- U.G. Wilson
- Ville-Matti Riihikoski

## 0.2.3 (2025-07-17)

This was a version bump only, there were no code changes.

## 0.2.2 (2025-07-17)

This was a version bump only, there were no code changes.

## 0.2.1 (2025-07-17)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **angular,react:** expose lastAssistantMessage helper ([bcbfecc](https://github.com/liveloveapp/project-cassini/commit/bcbfecc))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core:** Relax inferred schema constraint for numbers ([d8fb592](https://github.com/liveloveapp/project-cassini/commit/d8fb592))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Jake Harris @jakeharris
- Mike Ryan @MikeRyanDev
- U.G. Wilson

## 0.2.0 (2025-07-16)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **angular:** add createRuntime, createRuntimeFunction, and createToolJavaScript helpers ([2edee16](https://github.com/liveloveapp/project-cassini/commit/2edee16))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core:** add JavaScript runtime and function execution support ([34a56b1](https://github.com/liveloveapp/project-cassini/commit/34a56b1))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **core, angular, react:** allow stopping of requests in progress ([#226](https://github.com/liveloveapp/project-cassini/pull/226), [#101](https://github.com/liveloveapp/project-cassini/issues/101))
- **core,react,angular:** Add known model IDs ([eb11165](https://github.com/liveloveapp/project-cassini/commit/eb11165))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **react:** Combine createTool and createToolWithArgs into useTool ([4e2e796](https://github.com/liveloveapp/project-cassini/commit/4e2e796))
- **react:** Update useTool ergonomics for v0.2 ([c59f944](https://github.com/liveloveapp/project-cassini/commit/c59f944))
- **react:** Add JavaScript runtime hooks ([0e7ef30](https://github.com/liveloveapp/project-cassini/commit/0e7ef30))
- **samples:** Add a generative UI dashboard ([91f7808](https://github.com/liveloveapp/project-cassini/commit/91f7808))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))
- **www:** hero and docs ([#234](https://github.com/liveloveapp/project-cassini/pull/234))
- **www:** docs improvements ([#238](https://github.com/liveloveapp/project-cassini/pull/238))
- **www:** blog ([#241](https://github.com/liveloveapp/project-cassini/pull/241))
- **www:** improve blog post ([#244](https://github.com/liveloveapp/project-cassini/pull/244))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- netlify deployment ([#249](https://github.com/liveloveapp/project-cassini/pull/249))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **core:** Handle situations where no choices are generated ([7608510](https://github.com/liveloveapp/project-cassini/commit/7608510))
- **core, angular, react:** Properly render child components in nested UI schema ([#225](https://github.com/liveloveapp/project-cassini/pull/225), [#223](https://github.com/liveloveapp/project-cassini/issues/223))
- **samples:** Improve the rich chat prompt ([9a6ca96](https://github.com/liveloveapp/project-cassini/commit/9a6ca96))
- **samples/finance:** update Chat sample to use new runtime API and chart schema ([13286f3](https://github.com/liveloveapp/project-cassini/commit/13286f3))
- **samples/smart-home:** adapt ChatPanel and Planner samples to new runtime API ([bddf4ce](https://github.com/liveloveapp/project-cassini/commit/bddf4ce))
- **samples/smart-home:** bump dashboard model to gpt-4.1-nano ([0cec2fe](https://github.com/liveloveapp/project-cassini/commit/0cec2fe))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Jake Harris @jakeharris
- Mike Ryan @MikeRyanDev
- U.G. Wilson

## 0.1.1 (2025-06-02)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- examples ([30438d5](https://github.com/liveloveapp/project-cassini/commit/30438d5))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Mike Ryan @MikeRyanDev

## 0.1.0 (2025-05-30)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Mike Ryan @MikeRyanDev

## 0.0.3 (2025-05-30)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **azure:** Allow devs to supply the version number for models ([826afe4](https://github.com/liveloveapp/project-cassini/commit/826afe4))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **writer:** Add initial implementation of Writer adapter ([8b16959](https://github.com/liveloveapp/project-cassini/commit/8b16959))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168), [#164](https://github.com/liveloveapp/project-cassini/issues/164))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))
- **www:** Add Intro to Hashbrown video ([e7cbdee](https://github.com/liveloveapp/project-cassini/commit/e7cbdee))
- **www:** Add meta images to the website ([68b66db](https://github.com/liveloveapp/project-cassini/commit/68b66db))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167), [#159](https://github.com/liveloveapp/project-cassini/issues/159))
- vimeo video player ([0774d1e](https://github.com/liveloveapp/project-cassini/commit/0774d1e))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))
- **www:** More landing page polish ([13f55fe](https://github.com/liveloveapp/project-cassini/commit/13f55fe))
- **www:** Make the hero a little more rad ([f16aede](https://github.com/liveloveapp/project-cassini/commit/f16aede))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Mike Ryan @MikeRyanDev

## 0.0.2-9 (2025-05-29)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- better vm support ([0bed9e1](https://github.com/liveloveapp/project-cassini/commit/0bed9e1))
- **core:** Add emulated structured outputs mode to the API ([d127f9f](https://github.com/liveloveapp/project-cassini/commit/d127f9f))
- **core:** Switch to encoded binary responses for resiliency ([02dc324](https://github.com/liveloveapp/project-cassini/commit/02dc324))
- **core:** Improve consuming tool call results ([b57f42b](https://github.com/liveloveapp/project-cassini/commit/b57f42b))
- **core, angular:** Show errors in chat and completion ([#154](https://github.com/liveloveapp/project-cassini/pull/154))
- **google:** Wire up Gemini support ([f36402d](https://github.com/liveloveapp/project-cassini/commit/f36402d))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))
- **www:** analytics ([#168](https://github.com/liveloveapp/project-cassini/pull/168))
- **www:** docs clean up ([#177](https://github.com/liveloveapp/project-cassini/pull/177))
- **www:** Add homepage tour ([#173](https://github.com/liveloveapp/project-cassini/pull/173))

### 🩹 Fixes

- provider injector ([#94](https://github.com/liveloveapp/project-cassini/pull/94))
- do not show examples in Safari ([#167](https://github.com/liveloveapp/project-cassini/pull/167))
- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))
- **www:** api reference doesnt handle namespaces ([#162](https://github.com/liveloveapp/project-cassini/pull/162))

### ❤️ Thank You

- Ben Taylor
- Brian Love @blove
- Mike Ryan @MikeRyanDev

## 0.0.2-7 (2025-05-14)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- middleware ([4733a91](https://github.com/liveloveapp/project-cassini/commit/4733a91))
- **hashbrown:** Add internal state management to core ([#82](https://github.com/liveloveapp/project-cassini/pull/82))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))

### 🩹 Fixes

- **angular:** Remove infinite loop caused by tool dependencies ([#76](https://github.com/liveloveapp/project-cassini/pull/76))
- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))
- **core:** Minor bug fixes and enhancements to state ([9417198](https://github.com/liveloveapp/project-cassini/commit/9417198))

### ❤️ Thank You

- Brian Love @blove
- Mike Ryan @MikeRyanDev

## v0.0.2-6 (2025-05-08)

### 🚀 Features

- www homepage sdk mockup ([#62](https://github.com/liveloveapp/project-cassini/pull/62))
- www branding ([#63](https://github.com/liveloveapp/project-cassini/pull/63))
- www lla branding ([#64](https://github.com/liveloveapp/project-cassini/pull/64))
- **www:** Add a feature tour to the landing page ([#65](https://github.com/liveloveapp/project-cassini/pull/65))

### 🩹 Fixes

- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))

### ❤️ Thank You

- Brian Love @blove
- Mike Ryan @MikeRyanDev

## 0.0.2-5 (2025-05-01)

### 🩹 Fixes

- **azure:** Handle situations where the LLM emits a chunk without any choices ([1f3a3f0](https://github.com/liveloveapp/project-cassini/commit/1f3a3f0))

### ❤️ Thank You

- Mike Ryan @MikeRyanDev

## 0.0.2-4 (2025-05-01)

This was a version bump only, there were no code changes.

## 0.0.2-3 (2025-05-01)

### 🚀 Features

- www theme ([e95c430](https://github.com/liveloveapp/project-cassini/commit/e95c430))

### ❤️ Thank You

- Brian Love

## 0.0.2-2 (2025-05-01)

This was a version bump only, there were no code changes.

## 0.0.2-1 (2025-05-01)

This was a version bump only, there were no code changes.

## 0.0.2-0 (2025-05-01)

### 🚀 Features

- Add support for structured outputs ([740b69a](https://github.com/liveloveapp/project-cassini/commit/740b69a))
- Make rich chat a bit richer ([30d0353](https://github.com/liveloveapp/project-cassini/commit/30d0353))
- Add tools-javascript for code execution ([878c2e2](https://github.com/liveloveapp/project-cassini/commit/878c2e2))
- openai lib ([dcf2118](https://github.com/liveloveapp/project-cassini/commit/dcf2118))
- google lib ([15cb3a1](https://github.com/liveloveapp/project-cassini/commit/15cb3a1))
- gemini structured output ([8220813](https://github.com/liveloveapp/project-cassini/commit/8220813))
- Add framework-agnostic exposeComponent utility ([00c7943](https://github.com/liveloveapp/project-cassini/commit/00c7943))
- azure package ([b0b151d](https://github.com/liveloveapp/project-cassini/commit/b0b151d))
- Add a production-grade schema library implementation ([6dd4503](https://github.com/liveloveapp/project-cassini/commit/6dd4503))
- Add a mature version of the javascript tool ([1cb60bb](https://github.com/liveloveapp/project-cassini/commit/1cb60bb))
- www ([8070cd4](https://github.com/liveloveapp/project-cassini/commit/8070cd4))
- **nx-cloud:** setup nx cloud workspace ([ce401e1](https://github.com/liveloveapp/project-cassini/commit/ce401e1))

### 🩹 Fixes

- Make tool calling more type safe ([4df5e1b](https://github.com/liveloveapp/project-cassini/commit/4df5e1b))

### ❤️ Thank You

- Brian Love
- Mike Ryan @MikeRyanDev
