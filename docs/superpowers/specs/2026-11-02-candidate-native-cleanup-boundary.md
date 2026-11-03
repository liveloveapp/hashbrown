# Candidate failure native-cleanup boundary

Status: approved design; fixture source and tests authored; verification pending. Full21 retained115 passed,1 failed,256 not run; these remain partial failed results.

## Actual boundary

A consumed client ACK, caller cancellation and SDK disposed do not prove the native request context finished cleanup. The retained Azure Chat cancellation packet had two actual begun native contexts, but only one set of four terminal observations when the harness measured an inert repeated submission. All four later reached2 while every other stage stayed unchanged. NativeSessionContext.DisposeAsync awaits CleanupAsync before emitting RawAfter, TypedAfter, TransportAfter and finally Context.Disposed.

Across all15 retained ambiguous failure rows, each of the two owned native runs had actual upstream200 and a complete source RUN_STARTED. Missing public ACK in preack/timeout remains intentional. Definitive413 has no current native context and is handled by its separate branch; it must not enter this fence.

## Exact eligibility and readiness

Freeze all received native run membership at fence entry. Bind each unique request/run/thread/scenario/worker/route epoch to its qualified worker origin and loaded-identity evidence. Require one actual upstream200/header and one actual source ACK receipt, and parse the first complete captured source SSE frame to require RUN_STARTED with exact input thread/run. No producer ACK or missing-context member may be invented or silently filtered out. Every live poll must retain exact received membership; late/foreign/unbegun members fail.

On the owning worker, the target is the positive complete begun membership count, including possibly still-cleaning original warm work. All three real Before counts must exactly equal that target. Readiness requires all four terminal counts exactly equal it; lag/missing terminal is false, overshoot or invalid counts fails. Independently require current SDK disposal and no loading/resuming. Never use beforeDisposed+1, >= tolerance, public ACK as a prerequisite, successful save or Ready as a cancellation requirement.

Keep immediate failure/source/public evidence before the fence. Store actual prefence and settled observations. Bounded30second polling precedes the inert-operation baseline. After settling, recheck run/provider/effect/cold-acquire limits against the ORIGINAL pre-submit baseline and phase, so late work cannot disappear into a new baseline. Keep all physical fencing, current native result witnesses and strict unchanged assertions.

## TDD and verification

The maintained pure receipt test first validates complete unmutated evidence, then proves prior warm disposal alone cannot qualify two contexts and missing/lagging teardown or client activity remains incomplete. It falsifies extra/missing/duplicate requests, foreign identity/origin/worker/epoch, missing/wrong status or source ACK, incomplete/foreign source frame, mismatched Before counts, invalid/overshot terminal counts and wrong/duplicate disposal.

Missing helper export is scaffolding failure only; the retained full21 failure is integration RED. The approved pure helper is used by the common live failedAttempt fence before its inert baseline; parent runs actual focused/full gates, frozen review and fresh candidate qualification. No product SDK, provider-suite closure, journal/proxy primitive, published consumer, dependency or372-manifest changes.
