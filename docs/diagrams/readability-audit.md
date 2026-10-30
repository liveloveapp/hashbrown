# Diagram readability pass

A diagram should fit the article before the reader needs to expand it. This pass keeps the same 45 definitions and all 118 placements. It changes the reading path and wrapping, with the existing type sizes.

Most handoffs now move down the page. Branches use two columns when the distinction matters. Request and return paths remain separate. The persistence tables stack so field names and key/type columns have room. Sequence diagrams retain their participants and numbered messages, using narrower cards and shorter labels where possible.

The browser report checks every placement in both framework guides, including actual text bounds after the required font faces load. Expansion and mobile scrolling preserve natural text size.

| Definition                       | Kind         | Previous width (px) | Current width (px) |
| -------------------------------- | ------------ | ------------------: | -----------------: |
| request-boundary                 | architecture |                1040 |                740 |
| workbench-observations           | architecture |                1040 |                740 |
| prompt-context-boundary          | architecture |                1040 |                740 |
| proposal-lifecycle               | state        |                1040 |                740 |
| concept-conversation-turn        | sequence     |                1020 |                740 |
| concept-tools-round-trip         | sequence     |                 760 |                552 |
| concept-activity-audience        | architecture |                1040 |                720 |
| concept-interrupt-resume         | sequence     |                 760 |                552 |
| concept-shared-state             | sequence     |                 760 |                552 |
| concept-runtime-capabilities     | sequence     |                 760 |                552 |
| concept-schema-consumers         | architecture |                 750 |                720 |
| concept-history-context          | architecture |                1064 |                720 |
| concept-trusted-components       | architecture |                1074 |                720 |
| concept-structured-contract      | architecture |                1074 |                720 |
| concept-streaming-boundaries     | flow         |                1010 |                720 |
| concept-decision-choices         | flow         |                1094 |                720 |
| concept-debug-terminal           | flow         |                1080 |                720 |
| concept-system-policy            | architecture |                1104 |                720 |
| concept-provider-transform       | sequence     |                1020 |                740 |
| recipe-browser-text-round-trip   | sequence     |                 760 |                552 |
| recipe-thread-version-conflict   | sequence     |                 760 |                552 |
| recipe-decision-routing          | flow         |                1100 |                740 |
| recipe-parser-preview-validation | architecture |                1100 |                740 |
| recipe-form-state-boundaries     | state        |                1100 |                740 |
| recipe-prediction-freshness      | state        |                1100 |                740 |
| recipe-ui-selection-branches     | flow         |                1100 |                740 |
| recipe-public-endpoint-gates     | flow         |                1100 |                740 |
| recipe-ui-conversation-ownership | architecture |                1100 |                740 |
| recipe-markdown-finalization     | flow         |                1100 |                740 |
| recipe-native-model-preparation  | state        |                1100 |                740 |
| recipe-threadplane-angular       | architecture |                1100 |                740 |
| recipe-threadplane-react         | architecture |                1100 |                740 |
| direct-provider-request-boundary | sequence     |                1020 |                740 |
| custom-provider-event-lifecycle  | flow         |                1100 |                740 |
| langgraph-agent-boundary         | architecture |                1080 |                740 |
| dotnet-agent-boundary            | sequence     |                1020 |                740 |
| dotnet-native-mixed-turn         | sequence     |                1020 |                740 |
| typesafe-json-decision-boundary  | sequence     |                1020 |                740 |
| b4-durable-ownership             | architecture |                1040 |                740 |
| b4-recording-plan-erd            | erd          |                1070 |                740 |
| b4-read-then-resume              | sequence     |                 760 |                552 |
| migration-v06-transport          | architecture |                1000 |                740 |
| migration-v08-activity-boundary  | architecture |                1000 |                740 |
| threadplane-react-ownership      | architecture |                1060 |                740 |
| threadplane-angular-ownership    | flow         |                1030 |                740 |
