import { execSync } from 'node:child_process';

const BASE_REF = process.argv.find((a) => a.startsWith('--base-ref='))?.split('=')[1] ?? 'main';
const HEAD_REF = process.argv.find((a) => a.startsWith('--head-ref='))?.split('=')[1] ?? 'HEAD';

function getDiff(ref1: string, ref2: string): string {
  try {
    return execSync(`git diff ${ref1}...${ref2} -- src/router/types.ts`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
  } catch {
    return '';
  }
}

function detectChanges(diff: string): boolean {
  const intentChange = /^[+-].*(IntentType|find_code|get_symbol_context|get_impact|intent)/m;
  return intentChange.test(diff);
}

const diff = getDiff(BASE_REF, HEAD_REF);
const hasChanges = detectChanges(diff);

if (hasChanges) {
  console.log('Intent type changes detected — triggering full adapter test suite');
  process.exit(0);
} else {
  console.log('No intent type changes — skipping adapter test suite');
  process.exit(2);
}
