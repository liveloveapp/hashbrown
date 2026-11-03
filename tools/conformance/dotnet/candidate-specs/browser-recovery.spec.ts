import { test } from '@playwright/test';
import { candidateBrowserManifest } from '../harness/candidate-browser-manifest';
import { runCandidateKnownStringPilot } from '../harness/candidate-browser-recovery';
import { runCandidateBrowserJourney } from '../harness/candidate-browser-journeys';

const mode = process.env['HASHBROWN_CANDIDATE_BROWSER_MODE'];
if (mode !== 'pilot' && mode !== 'all')
  throw new Error('Explicit candidate browser pilot or all mode required');
for (const record of candidateBrowserManifest(mode))
  test(record.id, async ({ browser }) => {
    if (mode === 'pilot') await runCandidateKnownStringPilot(browser, record);
    else await runCandidateBrowserJourney(browser, record);
  });
