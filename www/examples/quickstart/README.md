# Documentation examples

These are the complete files used in the React and Angular Quickstarts and the Messages and turns guides. Guide tests compare the published code blocks with these files. `www:typecheck` checks React/server types and Angular templates against the built packages.

The server is a local-development example, not a deployed public endpoint. Provider credentials stay in its `.env` file. The frontend configuration demonstrates a same-origin proxy.

The recorder uses the actual client files with scripted AG-UI output. It verifies both frameworks, then records the shared visible behavior from React. Its frame and presentation styles are added by the recorder; the tutorial component itself has no stylesheet requirement.

Run through Nx:

```sh
npx nx typecheck www
npx nx docs-demo www
```

The demo target requires installed Playwright Chromium and ffmpeg. It needs no provider key. Captures, masters, and the browser verification report go to ignored `dist/docs-quickstart`; final media goes to `www/public/video/docs`. Captions and text walkthroughs are maintained beside the published videos. Review them when changing the interaction.
