/** Run the retained regressions without writing into the shipped datasets. */
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const flags = new Set(process.argv.slice(2));
const allowed = new Set(['--code-only', '--numerical', '--verbose', '--list']);
if ([...flags].some(flag => !allowed.has(flag)) || (flags.has('--code-only') && flags.has('--numerical'))) {
  console.error('Usage: node scripts/run-checks.mjs [--code-only | --numerical] [--verbose] [--list]');
  process.exit(2);
}

// These checks exercise actual production functions with explicit DOM/rendering
// fixtures. They do not require the separately distributed scientific assets.
const codeChecks = [
  'check-electrolytes.mjs',
  'check-playback-gain.mjs',
  'check-lead-axis-layout.mjs',
  'check-scene-interaction.mjs',
  'check-module-one-ui.mjs',
].map(name => [process.execPath, ['scripts/' + name]]);
const assetChecks = [
  'check-clinical-chart-scale.mjs',
  'check-conduction-continuity.mjs',
  'check-conduction-event-transitions.mjs',
  'check-conduction-render.mjs',
  'check-electrical-events.mjs',
  'check-electrical-field.mjs',
  'check-fitted-playback.mjs',
  'check_recorded_arrhythmias.mjs',
  'check-ui.mjs',
].map(name => [process.execPath, ['scripts/' + name]]);
assetChecks.push(
  [process.execPath, ['scripts/check-conduction-continuity.mjs', '--coupled']],
  [process.execPath, ['scripts/check-conduction-event-transitions.mjs', '--coupled']],
);

let temporary;
let checks;
if (flags.has('--numerical')) {
  temporary = await mkdtemp(join(tmpdir(), 'ekg-lab-checks-'));
  const python = process.env.PYTHON || 'python3';
  checks = [
    [python, ['dist/research/verification/audit_runtime_assets.py', '--output', join(temporary, 'runtime.json')]],
    [process.execPath, ['dist/research/verification/audit_fitted_cases.mjs', join(root, 'dist'), join(temporary, 'cases.json')]],
    [python, ['dist/research/verification/check_vm_parity.py', '--output', join(temporary, 'vm-parity.json')]],
  ];
} else {
  checks = flags.has('--code-only') ? codeChecks : [...codeChecks, ...assetChecks];
}

let failed = 0;
try {
  for (const [command, args] of checks) {
    const label = args.join(' ');
    if (flags.has('--list')) {
      console.log(label);
      continue;
    }
    const started = performance.now();
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    const passed = !result.error && result.status === 0;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${args[0]} ${args.includes('--coupled') ? '(coupled) ' : ''}(${((performance.now() - started) / 1000).toFixed(2)} s)`);
    if (!passed || flags.has('--verbose') || flags.has('--numerical')) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.error) console.error(result.error.message);
    }
    if (!passed) failed++;
  }
  if (!flags.has('--list')) {
    console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
    if (failed && !flags.has('--code-only')) {
      console.error('For missing assets, run npm run setup:assets. Numerical parity also needs npm run setup:research and NumPy. See docs/REPRODUCIBILITY.md.');
    }
    console.log('These checks do not replace browser layout, WebGL, or device-performance testing.');
  }
} finally {
  if (temporary) await rm(temporary, {recursive: true, force: true});
}
process.exitCode = failed ? 1 : 0;
