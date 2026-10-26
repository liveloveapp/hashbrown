# Local Chrome model qualification

The local test harness currently hardcodes v4 for typed tools. Chrome 155's
installed manifest distinguishes default Nano v3, Gemma v4 (installed manifest
`gemma4-2b-it`), and Gemma `v4_4b`. An application cannot select these through
`LanguageModel.create()`; model selection is a browser experiment.

Add a pure shared launch-options helper for local native tests. Accept only
`default`, `v4`, and `v4_4b` through `LOCAL_LLM_CHROME_MODEL_VERSION`. Preserve
existing defaults: normal model for text/media capability tests, v4 for native
tools. Keep tool interfaces/conversation backend separate from the foundational
model override so the default model can be probed with experimental interfaces.
Reject misspellings instead of silently testing another configuration. Include
the selected configuration in Playwright report metadata. Selection is not proof
of downloaded model identity, inference quality, or tool support.

Use the helper in the three native launch configurations. Keep all local suites
opt-in, forbidden in CI, and existing explicit download gates unchanged. No
runtime dependency, SDK API change, or model download is included. Retain strict
nested UI failures and all previous evidence. Document current release, model
availability, Ollama and WebLLM findings separately from historical snapshots.

Validation: failing pure-helper tests first; affected conformance build/test/lint;
30 existing application-controlled phase contracts; current installed Ollama
provider protocol evaluation. Further model inference waits for model download
choice. Cross-hardware testing remains deferred.
