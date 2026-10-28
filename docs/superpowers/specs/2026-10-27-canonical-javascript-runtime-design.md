# Canonical JavaScript runtime

Extend the approved canonical workbench rollout to JavaScript runtime in Angular and React. Preserve LLA styling, all panels, the bottom timeline and inert synchronized playback. No SDK release or new dependencies.

## Teaching task

Start from the workbench's application-owned two-step plan at revision zero. Run visible JavaScript that calls a narrow `readPlan({ revision: 0 })` host capability and calculates an estimate using 15 minutes per step (30 minutes). A second run uses 10 minutes per step (20 minutes). Neither run applies or edits the plan. Explicit application-owned script presets also demonstrate missing browser globals, invalid host arguments and recovery. The editor accepts bounded arbitrary scripts; execution has a bounded runtime timeout and abort signal.

This is real Hashbrown QuickJS execution through each framework's runtime APIs, with no model/provider request. User entries describe explicit Run actions; replies are labelled application-rendered runtime results, never model messages. Retain and explain optional `useToolJavaScript` / `createToolJavaScript` integration separately. No fake JSON streaming: code and actual host/result observations arrive when they really occur.

## Architecture

A shared immutable contract defines host schemas, strict revision validation, scripts, runtime observations and inspector projections. A shared controller owns run generations, abort, safe bounded capture and mounted DOM controls. Framework clients instantiate actual `useRuntime`/`useRuntimeFunction` and `createRuntime`/`createRuntimeFunction`, respectively, and pass their actual run function into that controller. The existing workbench store records immutable observation values per frame, with Code and Runtime inspector views alongside Requests, UI and State. No implementations, handles or callbacks enter captured state.

Execution is explicit and single-flight. Starting a new conversation, navigating away, Stop or disposal invalidates the origin and aborts outstanding work. Late host/results cannot append or alter current state. Historical playback disables Run/editor/presets, performs no execution or writes, and displays the code, calls and outcome from that frame. Every run gets a fresh QuickJS context. Host code validates arguments itself; schemas do not replace host validation. Timeouts interrupt script evaluation but do not roll back arbitrary host effects or set memory limits.

## Verification and delivery

Test contract boundaries, immutability, malformed arguments, deadlines, cancellation and stale results before implementation. Browser coverage exercises both genuine framework runtimes, estimates 30 and 20, rejected browser access and arguments, loop timeout/recovery, fresh context, navigation/stop and inert replay. Record two actual framework demos with ffmpeg, captions, posters, result screenshots and transcripts. Rewrite both runtime guides in the user's established task-first voice, with checked complete sources and concise API snippets. Update catalog/overview/media inventory to 27 lessons and 54 paths. Build/test/lint affected projects, route report and hosted build; review, PR, merge only on green and verify exact production deployment/media.
