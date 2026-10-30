---
title: 'Ethics: Hashbrown React Docs'
meta:
  - name: description
    content: 'Design clear AI interactions with visible review, appropriate data access, and application-owned actions.'
---

# Ethics

<hb-docs-demo demo="canonical-workbench-natural-forms-react">
</hb-docs-demo>

An AI feature asks a user to trust a system that can produce an incorrect or incomplete answer. Responsible design starts with that interaction: what the user sees, what data leaves the application, and which actions require a person's decision.

Hashbrown gives us tools for building the interface. We still own the product decisions around disclosure, access, review, and recovery.

<a id="transparency"></a>
<a id="example-displaying-ai-attribution"></a>

<hb-diagram diagram="proposal-lifecycle"> </hb-diagram>

## Make the proposal visible

Tell the user when content was generated. Show what a proposed change will do before applying it. For example, an assistant can draft a delivery note while the user reviews and edits the text in an ordinary form. Generating the note should not silently submit the order.

| Interface state     | What the user should understand                        |
| ------------------- | ------------------------------------------------------ |
| Generating          | The current content may still change.                  |
| Ready for review    | A proposal is available; it has not been applied.      |
| Failed or cancelled | The requested operation did not complete successfully. |
| Applied             | The application confirmed the specific change.         |

Use concrete labels such as **Apply delivery note** instead of an ambiguous **Continue**. Preserve an ordinary editing or manual path when generation is unavailable.

<a id="human-oversight"></a>

## Keep approval tied to the current draft

Here is an application-owned gate you can adapt before enabling a review action. It has no model or framework dependency. It handles only a local draft; the server must independently authorize and validate any saved change.

```ts
type ReviewedDraft = {
  text: string;
  complete: boolean;
  failed: boolean;
  sourceRevision: number;
};

export function canReviewDraft(
  draft: ReviewedDraft,
  currentRevision: number,
): boolean {
  return (
    draft.complete &&
    !draft.failed &&
    draft.sourceRevision === currentRevision &&
    draft.text.trim().length > 0 &&
    draft.text.length <= 2000
  );
}
```

The conditions are explicit: a completed result, no known failure, a current source revision, and the application's text limits. This does not establish factual correctness or user consent by itself. Review the content and make the final action explicit.

<a id="privacy"></a>
<a id="user-consent"></a>

## Choose data deliberately

Send the context needed for the task. Avoid sending an entire customer record when an order status is sufficient. Keep credentials on the server, authorize reads and writes, and decide how conversation data is retained and deleted. Explain those product choices where the user makes the decision to share data.

Explain what data will be sent before asking the user to share it, and give them a useful way to decline. A disclosure such as “Drafted with AI. Review before applying” makes the proposal visible without claiming that it is verified.

Treat generated text and tool requests as untrusted inputs. A component catalog constrains the interface the model can request; it does not authorize a refund, account change, or database write. Validate those actions at their application boundary.

<a id="accessibility"></a>
<a id="content-moderation"></a>

## Test the ordinary and difficult paths

Review the feature with keyboard and screen-reader navigation, small viewports, slow responses, unavailable models, misleading output, and cancellation. Make errors actionable without exposing private data. For features that accept public input or publish generated content, decide where moderation and human review belong and test their failure paths too. Include people who use the product in this review, and evaluate whether the feature helps them complete the task.

<a id="further-reading"></a>

## Explore it in the workbench

Open the **Natural language forms** lesson in the workbench below. Its **Replay** tab shows an actual generated plan, an editable form, and an explicit **Apply** action.

<hb-workbench-launcher lesson="natural-forms">
</hb-workbench-launcher>

Watch the distinction between the model's draft, the user's edited form, and the accepted application state in **State**. The replay retains a model overwrite and an explicit correction; it does not replace that outcome with an ideal response. Scrub the timeline to compare those moments. Replay cannot apply the plan or send another request.

This is a small example of an interaction boundary, not a complete policy for your product. Continue with [Natural language forms](/docs/react/recipes/natural-language-to-structured-data), [Public endpoints](/docs/react/recipes/public-endpoint), and the [production recovery reference](/docs/react/platform/b4run) for the corresponding implementation details.
