# Durable .NET checkpoint validation

## Published baseline

PR [727](https://github.com/liveloveapp/hashbrown/pull/727) merged as `61bcd868328c95d271b4314e20623ae27a7dc4b8`. Its [main CI and production deployment](https://github.com/liveloveapp/hashbrown/actions/runs/40066689799) succeeded. Both framework recipes returned HTTP 200 with the merged headings, pinned versions, provider configuration, interrupt/resume guidance, source link and sidebar navigation. The Platforms and Custom Platform entry pages linked correctly to each recipe.

- https://hashbrown.dev/docs/react/platform/dotnet
- https://hashbrown.dev/docs/angular/platform/dotnet

## Design and review

The PostgreSQL/Npgsql design, implementation plan, store implementation, and browser/docs/CI integration received independent spec and code-quality reviews. Npgsql 10.0.3 was explicitly approved before adding the dependency. Review corrections covered expired preparation leases losing authority to finalize, cleanup failures remaining visible without masking primary failures, concurrent fixture DDL initialization, exact recipe replacement guards, and explicit browser ownership limitations after acknowledged stream failure.

## Local evidence

- Restart regression first failed for OpenAI and Azure: killing the creating process made the old memory-only implementation return 410 instead of completing the pending batch on a second process.
- Preparation-failure tests were written before the missing fixture behavior; the valid-lease failure first returned RUN_FINISHED instead of RUN_ERROR. The expired-lease case first lacked its required preparation barrier. Both passed after adding the deterministic fixture behavior.
- The storage implementation passed 66 HTTP tests against PostgreSQL 18, followed by a targeted concurrent-startup rerun after serializing the fixture's effect-table creation. Durable effects are observed in the database, not inferred from per-process counters.
- The original C# documentation failed compilation because the new store constructor requires its registry. Both framework examples were updated together; all four memory/PostgreSQL and confirmation/no-confirmation combinations compiled with zero warnings/errors.
- Restart browser tests first failed in all four framework/provider combinations when resume targeted the stopped process. A stable HTTP/SSE relay now routes subsequent requests to the replacement instance while the live browser retains its batch.
- The first complete browser run passed 107 of 108 cases, including all eight new durable cases. An original React/Azure missing-terminal assertion failed while its correctly truncated HTTP response took 5.209 seconds. Trace bytes showed RUN_STARTED, TEXT_MESSAGE_START and TEXT_MESSAGE_CONTENT, with no terminal event. The test now awaits observed graceful response completion before checking UI error propagation; no timeout was widened. This fix received independent review and passed 12 repetitions across all four projects.
- A parent-run aggregate on the rebased source passed build, test and lint for `dotnet-conformance`, `conformance` and `www`: 66, 45 and 698 tests respectively. All 21 tasks succeeded.
- Shared Jest emitted a worker-exit warning in the aggregate. An initial instrumented serial diagnostic hit an unchanged fixture's five-second deadline under load; a fresh serial run with open-handle detection passed all 45 tests in 16.6 seconds without a leak report. No timeout configuration or shared fixture source changed.
- The next complete .NET browser rerun passed 106 cases. Its two early failures were a replacement-worker startup/global deadline before resume and an empty-output .NET startup deadline before any model request. The missing-terminal case passed in all four projects. Host load was 18–22 on ten logical CPUs; the busy application server and the occupied shared-suite default port belonged to another workspace and were left alone. The shared suite uses its existing alternate-port settings, and a subsequent local .NET run bounds only the test processes with `DOTNET_PROCESSOR_COUNT=2`; source behavior and test deadlines are unchanged.

- The final .NET provider browser matrix passed all 108 cases in 3.3 minutes with `DOTNET_PROCESSOR_COUNT=2`; normal test deadlines and worker count were unchanged. The shared browser/provider suite passed all 72 cases on its supported isolated ports.

Raw local logs are outside the repository under `/tmp/hashbrown-dotnet/`: `durable-final-checks.log`, `durable-shared-handles.log`, `durable-shared-handles-inprocess.log`, `durable-task2-docs-red-detail.log`, `durable-task2-browser-red.log`, `durable-task2-provider-green.log` and `durable-task2-eof-repeat.log`, `durable-task2-provider-bounded.log` and `durable-shared-browser-isolated.log`. These files are temporary execution evidence, not shipped application assets. Remote PR/main deployment evidence will be linked from the pull request after completion.

Existing warnings include Nx/Jest executor deprecation, color-environment notices, API Extractor TSDoc/forgotten-export notices and build tool/bundle advisories. The .NET C# builds and exact recipe compilations reported zero warnings/errors.

## Practical limits

The durable guarantee is at most one registered executor dispatch per batch against the authoritative PostgreSQL state. A crash between the committed marker and invocation can yield zero effects; a crash after an external effect can leave an unknown outcome. Neither is automatically replayed. Business effects need application idempotency or an application transaction for stronger guarantees. Stranded dispatch markers retain capacity until application-specific reconciliation.

Replicas must preserve registry-version meanings and authenticated scope, and share ordinary authentication/session configuration. PostgreSQL must retain acknowledged commits. A live, still-pending browser batch can survive backend restart and routing changes; browser reload or failure after resume acknowledgement does not restore local batch ownership. The source recipe does not add browser persistence, an operator reconciliation API, automatic retry queues or a new published .NET package.
