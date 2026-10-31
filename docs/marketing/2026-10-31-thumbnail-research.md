# Social cards, thumbnails, recommendations and CTR

Research date: October 31, 2026, America/Los_Angeles. Scope: Brian Love's personal X and LinkedIn posts about Hashbrown, plus future YouTube videos. No posts were approved, published or modified during this research. Dry-run remains enabled.

## Findings that change our design brief

1. **Design for the intended action.** A YouTube thumbnail helps someone decide whether to watch. An X or LinkedIn image can deliver useful information directly in the feed. An image expansion, a website visit and a video view are different outcomes.
2. **Useful curiosity needs a specific subject.** “Web LLMs. What works?” is a reasonable announcement, but “Valid JSON. Wrong answer.” creates a more concrete question for a developer. The supporting post must immediately explain the actual finding.
3. **Portraits are an option, not a proven growth mechanism.** Use Brian's real photographs where his experience or judgment is the point. Keep a product/graphic alternative. None of the research establishes a universal face-related CTR lift for this audience.
4. **Keep the product evidence readable.** A complete workbench screenshot shrunk into a card is difficult to inspect. Select a relevant region and show it straight, at a useful scale. A larger crop is more valuable than decorative rotation or a browser frame.
5. **Use platform-specific compositions.** A shared identity does not require identical dimensions. Explore square X cards, square or portrait LinkedIn cards, and landscape YouTube thumbnails. These are proposed starting points, not organic-ranking requirements.
6. **Measure qualified attention.** For Hashbrown, the useful downstream outcomes are relevant readers, docs/workbench visits and eventual adoption. Raw likes, total engagement and CTR each omit part of that goal.

The direction we already explored remains useful: an author format and a product format. The refinement is to make the promise more specific, vary the composition by placement, and establish a measurement plan before claiming a winner.

## Evidence standard and limits

- **Platform documentation:** reliable for feature behavior, definitions and declared system design; it does not establish causal creative performance on Brian's account.
- **Platform advertising guidance:** useful for legibility and asset preparation; paid results, delivery restrictions and targeting do not automatically transfer to organic personal posts.
- **Public recommender code:** evidence of available mechanisms and defaults at a revision. It is not a complete simulation of an individual impression or proof that a visual treatment will get more reach.
- **Observational thumbnail studies:** useful for generating hypotheses. Views confound topic, audience, title, distribution and thumbnail; views are not CTR.
- **Our design recommendations:** hypotheses to validate. There is no measured performance comparison of the current Hashbrown cards or Brian's portrait kit.

I inspected official material from all three platforms, the current X source repository, and two original thumbnail studies with their stated methods. I did not run either study's analysis or audit the platform models. Unverified “algorithm hacks” are not treated as findings.

## The surfaces and metrics are different

| Surface                    | What the image does                                                             | Useful primary outcome for Hashbrown                                  | Supporting measures                                                            |
| -------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| X native image post        | Makes a technical point visible beside post copy; can be expanded               | Relevant conversations and, on linked posts, qualified site visits    | Impressions, URL clicks, profile activity, media interactions, replies         |
| LinkedIn native image post | Supports a professional finding or demonstration                                | Useful engagement from relevant developers and docs/workbench visits  | Reach, saves, sends, relevant comments, followers, link visits where available |
| YouTube long-form          | Packages a video with its title before playback                                 | Watch time from the experiment and viewers finding the promised value | Impressions CTR by traffic source, retention, average view duration            |
| YouTube Shorts             | Appears on some discovery surfaces; the player has a different consumption flow | Evaluate the Short using its own viewing/retention measures           | Do not transplant a long-form thumbnail CTR target                             |

“CTR” must name its numerator and denominator. For an X linked post, define URL clicks / post impressions. For an organic LinkedIn experiment, use external-link visits / post impressions only when both are measured consistently. These are not YouTube's registered-thumbnail-impression CTR. Saves, sends and replies should remain separate counts or rates rather than being silently called clicks.

## YouTube: earn a click that the video can satisfy

YouTube says recommendations incorporate viewing history, feedback and satisfaction surveys, among other signals. This supports a useful distinction: getting someone to begin watching and delivering a satisfying video are related but separate jobs. A higher CTR is not sufficient evidence of better recommendations. [YouTube recommendation-system explanation](https://support.google.com/youtube/answer/16089387?hl=en).

Its thumbnail/title guidance recommends clear, readable compositions, audience awareness, accurate titles and restrained complexity. It distinguishes searchable titles from curiosity-driven ones. Our inference: the image and title should work together, with the title establishing the subject and the image emphasizing a consequential detail. “Use exactly three words” is not a platform rule. [Thumbnail and title guidance](https://support.google.com/youtube/answer/12340300?hl=en).

YouTube's CTR FAQ says half of channels/videos fall somewhere between 2% and 10%, with substantial variation by audience, traffic source and distribution. That range is descriptive, not a target for Hashbrown. It also warns against small-sample decisions and interpreting sequential title/thumbnail swaps as controlled tests. Expanding into a less familiar audience can lower CTR while increasing useful reach. [CTR FAQ](https://support.google.com/youtube/answer/7628154?hl=en).

### Native testing

The current native A/B tool supports up to three title/thumbnail alternatives, with thumbnail-only, title-only or combined tests. It selects using watch time rather than CTR alone; tests can take up to two weeks and may produce no clear winner. Eligibility includes desktop Studio and advanced features; Shorts are excluded. For our first thumbnail experiment, keep the title and video fixed and vary the image deliberately. Testing packages is also valid, but answers a different question. [YouTube A/B testing](https://support.google.com/youtube/answer/16391400?hl=en).

### Current file guidance

The live Help page now recommends 3840 × 2160 for video thumbnails, 16:9. It distinguishes desktop uploads up to 50 MB from mobile video thumbnails up to 2 MB, and describes custom Shorts thumbnails with a 9:16 recommendation. Older universal “1280 × 720, always 2 MB, Shorts never support custom uploads” summaries are outdated against this page. Keep a high-resolution master and export for the actual upload workflow. This does not change Hashbrown's separate 5 MiB social-image limit. [Current thumbnail upload guidance](https://support.google.com/youtube/answer/72431?hl=en).

## LinkedIn: relevance and professional value, beyond a click

LinkedIn's March 12, 2026 engineering account describes semantic retrieval and sequential ranking using professional context and interaction history. Ranking predicts multiple behaviors, including clicks, skips, long dwell, likes, comments and shares. No fixed rule such as “a portrait earns a reach bonus” follows from that architecture. Our implication: make the intended audience and engineering lesson clear in the combined copy and image. [2026 Feed architecture](https://www.linkedin.com/blog/engineering/feed/engineering-the-next-generation-of-linkedins-feed).

Earlier engineering work explicitly treats predicted short dwell as a negative signal and describes balancing passive and active behavior. Making a card harder to understand is not a defensible “increase dwell” tactic. Our goal should be useful inspection time, not forced reading or confusion. [Dwell-time engineering, October 2024](https://www.linkedin.com/blog/engineering/feed/leveraging-dwell-time-to-improve-member-experiences-on-the-linkedin-feed).

The platform's 2026 Feed update says it is reducing generic recycled content, engagement bait and mismatched media. This favors our existing editorial stance: publish actual findings, show the relevant product behavior, and ask a question when there is something substantive to discuss. It does not justify inventing a provocative claim to accompany an unrelated face. [Feed update](https://www.linkedin.com/pulse/updates-linkedin-feed-focusing-authentic-relevant-tim-jurka-umwnc/).

### Native images, links and dimensions

Organic photo guidance permits image aspect ratios from 3:1 to 4:5 and a 5 MB upload limit. This supports exploring a native 4:5 composition; it does not prove that portrait performs better than square or landscape. A native uploaded image is also different from an external-link preview. Clicking our image should not be represented as a direct navigation button. [Organic photo guidance](https://www.linkedin.com/help/lms/answer/a527229).

Advertising documentation separately lists 1200 × 628 landscape, 1200 × 1200 square, and a 4:5 vertical recommendation, with paid vertical delivery restricted to mobile. That restriction belongs to the ad product; do not state that organic portrait posts disappear on desktop. Proposed organic exports: 1200 × 1200 and 1200 × 1500, followed by actual feed/crop checks. [Single-image advertising specifications](https://www.linkedin.com/help/linkedin/answer/a426534/single-image-ads-advertising-specifications?lang=en).

The existing LinkedIn plan puts links in the author's first comment. Keep that editorial choice for this round. The inspected sources do not establish a universal organic distribution benefit from that placement; extra navigation may also lose visits. Do not turn “links in comments beat links in posts” into a factual design requirement. A future placement experiment needs its own authorization and comparable posts.

### Measurement

Current personal-post analytics document impressions, estimated unique reach, saves, sends, followers and profile viewers, plus external-link visits in the post. Some counts include repeat actions. Do not assume link-in-comment clicks appear in the parent post's link metric. Track those destination visits separately where possible and note attribution gaps. The existence of a reported metric does not establish its ranking weight. [Personal-post analytics](https://www.linkedin.com/help/linkedin/answer/a516971).

## X: stop the right reader, then give them something worth reading

X's Help Center describes personalized retrieval and ranking from inside and outside a viewer's network. Following is a different, reverse-chronological surface. A card does not encounter one universal audience or ranking context. [For You explanation](https://help.x.com/en/resources/recommender-systems/for-you-home-timeline-recommendations).

The public source inspected at commit `9106e9f33ee9cc6a92929fc798ae6c566e2841cb` includes October 8 and October 13 updates concerning time-spent prediction and retrieval of posts people read through. It also explicitly warns that weights operate on predicted actions/values, not raw engagement counts. Thus “one reply is worth N likes” is not a valid interpretation. Some components remain unpublished; deployment and personalization also matter. The practical inference is to reward the reader with a clear, relevant technical point after catching attention. [Pinned X source and update log](https://github.com/xai-org/x-algorithm/tree/9106e9f33ee9cc6a92929fc798ae6c566e2841cb).

X's creative guide emphasizes a clear connection between copy and imagery, mobile legibility, and 16:9 or 1:1 layouts. This is advertising guidance, not proof of an organic-image ranking boost. It is a sound usability starting point for our static cards. Proposed X exports: 1200 × 1200 for portrait/idea cards and 1600 × 900 for wider product evidence. [Creative guidance](https://business.x.com/en/advertising/creative-best-practices).

X's dashboard distinguishes engagements, link clicks, media clicks and detail expansion. An image that makes people expand it may raise engagement without increasing blog traffic. Record the action we wanted before evaluating the creative. Current account/product availability should be checked when collecting analytics; documentation does not guarantee every metric is exposed through our API access. [Dashboard definitions](https://business.x.com/en/help/campaign-measurement-and-analytics/tweet-activity-dashboard).

## What the evidence says about faces

There is no sound basis here for requiring Brian's face on every card or promising an uplift.

- A June 2026 Hitfactor study reports roughly 6% fewer views associated with face thumbnails in within-channel comparisons across about 1.25 million videos. It publishes a replication package. However, this is an observational study of a selected channel population, measuring views rather than thumbnail CTR. Topic, title, historical thumbnail changes and other factors remain potential explanations. It is not evidence that removing Brian's face will improve Hashbrown. I inspected the report and repository structure but did not reproduce the statistics. [Study](https://docs.hitfactorapp.com/labs/2026-thumbnails-with-faces/), [replication package](https://github.com/HitFactorApp/youtube-thumbnail-face-study).
- An October 29, 2026 Mark Studios study labels 487 thumbnails from 98 large channels. It reports faces in 78% and headline text in 45%; text, where present, has a median of three words. It explicitly lacks CTR data. Popularity and prevalence are not causal performance evidence, and the sample is not a developer-channel benchmark. [Original descriptive study](https://www.markstudios.com/research/youtube-thumbnail-study).

Use the portrait because it supports authorship, a recognizable recurring voice or the specific question. Compare a real portrait against a meaningful product/graphic treatment. Avoid manufactured facial expressions and irrelevant reactions. The six real poses already provide variety; preserve the original photographs and honor their right/bottom crop constraints.

## Revised Hashbrown creative brief

These are design judgments derived from the research, not platform mandates:

### One promise and one visual anchor

- Start with the developer's problem or an observed result. Let the image surface the tension and the post deliver the explanation.
- Aim for approximately three to seven prominent words initially. Add a tiny subject label only when needed to establish relevance. A longer useful label can be better than a short vague hook.
- A face, a product crop or a simple evidence graphic should dominate. Avoid trying to give all three equal importance.
- Keep claims, model qualifications and dates accurate across image, copy and destination. Put detailed caveats in the nearby copy; do not use a caveat to excuse an overstated image.
- Use a restrained Hashbrown identifier. The author name/avatar already appear in feeds, so a large repeated byline is usually unnecessary.
- Keep yellow/ink/ivory and Hanken Grotesk, with substantial contrast. This is brand consistency, not a claim that a particular color gets more reach.

### Three treatments worth developing

| Treatment           | Example hook                | Visual                                               | Why it is useful                                                                    |
| ------------------- | --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Author finding      | “Valid JSON. Wrong answer.” | Brian's actual analytical/thinking portrait          | Establishes a concrete engineering tension and a person behind the finding          |
| Product behavior    | “Your app decides.”         | Straight crop of the actual workbench state/proposal | Shows the relevant interface without asking the reader to inspect a whole dashboard |
| Technical mechanism | “One token. Broken JSON.”   | One clearly illustrative truncated string            | Makes the failure mechanism visible without pretending to show an actual test trace |

For the November announcement, compare “Local models. Real limits.” with a more positive, outcome-led hook. The existing “Web LLMs. What works?” remains a reasonable control. Do not equate a more dramatic wording with a measured improvement.

### Format and preview plan

| Platform          | First composition to explore                    | Review conditions                                                                                     |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| X                 | 1:1 author/idea; 16:9 when evidence needs width | Full post plus image at 320–375 px display width; expansion; light/dark surrounding feed              |
| LinkedIn          | 4:5 author/product; 1:1 control                 | Mobile and desktop feed rendering, collapsed copy, image crop, first-comment discoverability          |
| YouTube long-form | 16:9 master; upload settings from current Help  | Title + thumbnail at 320 and 160 px wide, alongside other videos; leave room for duration/UI overlays |

The preview widths and overlay clearance above are our QA choices. They are not official minimum text sizes or universal safe-zone specifications. Never auto-crop a face or trust one export to fit every placement.

The existing static-image pipeline supports PNG/JPEG images with URL, alt text and reviewed SHA-256. It does not currently imply carousel, animated demo or YouTube publishing support. Keep final social assets within its 5 MiB limit even if a platform permits more. Update URL/hash/alt together only after a replacement is reviewed.

### Accessibility and honesty

Include the meaningful headline in alt text, describe the actual product crop or illustrative relationship, and identify Brian where relevant. Do not use alt text as keyword stuffing or claim it provides a reach bonus. X's guide explicitly emphasizes objective descriptions and including or summarizing image text. [Image-description guidance](https://help.x.com/en/using-x/write-image-descriptions).

All mockup interfaces that are not captured product behavior must be labeled as illustrations. Use original photograph treatments from the pilot kit for this exploration; no public asset replacement or photo-library approval is inferred from a local concept review.

## Measurement plan: learn without manufacturing a winner

### Define success before publishing

For each post, record its purpose, topic, first line/title, intended audience, platform, image variant, dimensions, pose, link placement and scheduled time. Record image digest and crop so we know which creative was actually used. Keep absolute counts alongside rates.

For linked announcements, prioritize qualified destination sessions and useful subsequent actions such as reaching the docs or opening the workbench. For native technical posts, prioritize relevant comments, saves/sends where available and relevant profile/follower activity. “Qualified” needs an agreed event definition; do not quietly substitute any visit or any like.

Use a distinct campaign/content identifier in destination tracking when authorized. Analytics can miss visits because of privacy controls, referrer loss, copy/paste or cross-device behavior. Report observed attribution rather than claiming total impact.

### Test the right question

1. First choose a clear message and readable composition. Review in a simulated feed with surrounding content; a large standalone mockup hides competition and scale problems.
2. To test portrait contribution, keep hook, topic, palette, text size and destination fixed. Change the portrait treatment versus a relevant graphic as narrowly as possible. Changing the whole package tests the package, not the face.
3. Use native simultaneous YouTube testing for eligible videos. Do not replace it with a before/after comparison and call that randomized evidence.
4. Treat organic X/LinkedIn comparisons across posts as directional learning, not randomized A/B tests. Time, audience, subject and distribution differ. Repeated matched examples can inform judgment, but one successful Tuesday is not proof of a template effect.
5. Capture consistent snapshots, proposed at 24 hours, 72 hours and 7 days. These are reporting windows, not claimed ranking thresholds. Do not manufacture activity in a supposed “golden hour.”
6. Do not make paid tests or publishing a prerequisite for reviewing the designs. Those require separate authorization.

### Small numbers and stopping

Do not set a universal CTR threshold or declare tiny lifts meaningful. As an illustrative independent-binomial calculation, distinguishing 3% from 4% CTR at two-sided 5% significance and 80% power takes roughly 5,300 impressions per arm. This is a planning example, not a sample-size requirement for every platform; repeated viewers and adaptive recommendation exposure violate its simplifying assumptions. A low-volume account may need to rely on qualitative relevance and larger differences for a while.

A dry run verifies scheduling and dispatch contracts. It produces no audience impressions and cannot validate a CTR hypothesis. The November week should remain drafts until Brian approves; dry-run should remain enabled until he separately authorizes live operation.

## Suggested second pass for November 2–8

| Post                          | Explore next                                                          | Keep explicit in the post copy                                            |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Monday X announcement         | Portrait, “Local models. Real limits.”                                | What passed, what failed, link to the full November update                |
| Tuesday LinkedIn announcement | Portrait or product in 4:5, compare against the existing article card | M1 Max scope, bounded workflows, specific runtime/model limitations       |
| Tuesday X schema question     | Analytical portrait, “Valid JSON. Wrong answer.”                      | Schema shape versus actual requested values                               |
| Wednesday X tools             | One linear tool sequence, “The app picks the tool.”                   | App-controlled WebLLM path and argument validation                        |
| Thursday LinkedIn workbench   | Readable product crop, “Your app decides.”                            | Recorded replay, preview/accept/state distinction                         |
| Thursday X workbench          | A different relevant crop using the same visual family                | Stale proposals and explicit application writes                           |
| Friday X termination          | One string/termination illustration, “One token. Broken JSON.”        | Qwen3.5 configuration fix; illustrative graphic, not a captured failure   |
| Saturday X catalog            | Smaller component selection or restrained thinking portrait           | Single-component qualification does not establish nested-catalog support  |
| Sunday X network              | One device/network relationship, “Local ≠ offline.”                   | Downloads, tools, image resolution, telemetry and explicit fallback paths |

Next deliverable: local concept comparisons with the surrounding post context and feed-size previews. Select a direction before producing or replacing the nine final assets. No promise of CTR uplift, no new public posts, no queue approval, no dry-run change.
