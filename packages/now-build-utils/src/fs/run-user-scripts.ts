import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import spawn from 'cross-spawn';
import { SpawnOptions } from 'child_process';
import { deprecate } from 'util';

function spawnAsync(
  command: string,
  args: string[],
  cwd: string,
  opts: SpawnOptions = {}
) {
  return new Promise<void>((resolve, reject) => {
    const stderrLogs: Buffer[] = [];
    opts = { stdio: 'inherit', cwd, ...opts };
    const child = spawn(command, args, opts);

    if (opts.stdio === 'pipe') {
      child.stderr.on('data', data => stderrLogs.push(data));
    }

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        return resolve();
      }

      const errorLogs = stderrLogs.map(line => line.toString()).join('');
      if (opts.stdio !== 'inherit') {
        reject(new Error(`Exited with ${code || signal}\n${errorLogs}`));
      } else {
        reject(new Error(`Exited with ${code || signal}`));
      }
    });
  });
}

async function chmodPlusX(fsPath: string) {
  const s = await fs.stat(fsPath);
  const newMode = s.mode | 64 | 8 | 1; // eslint-disable-line no-bitwise
  if (s.mode === newMode) return;
  const base8 = newMode.toString(8).slice(-3);
  await fs.chmod(fsPath, base8);
}

export async function runShellScript(fsPath: string) {
  assert(path.isAbsolute(fsPath));
  const destPath = path.dirname(fsPath);
  await chmodPlusX(fsPath);
  await spawnAsync(`./${path.basename(fsPath)}`, [], destPath);
  return true;
}

export async function hasPackageLockJson(destPath: string) {
  const { hasPackageLockJson } = await scanParentDirs(destPath);
  return hasPackageLockJson;
}

async function scanParentDirs(destPath: string, scriptName?: string) {
  assert(path.isAbsolute(destPath));

  let hasScript = false;
  let hasPackageLockJson = false;
  let currentDestPath = destPath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const packageJsonPath = path.join(currentDestPath, 'package.json');
    // eslint-disable-next-line no-await-in-loop
    if (await fs.pathExists(packageJsonPath)) {
      // eslint-disable-next-line no-await-in-loop
      if (scriptName) {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf8')
        );
        hasScript = Boolean(
          packageJson.scripts && scriptName && packageJson.scripts[scriptName]
        );
      }
      // eslint-disable-next-line no-await-in-loop
      hasPackageLockJson = await fs.pathExists(
        path.join(currentDestPath, 'package-lock.json')
      );
      break;
    }

    const newDestPath = path.dirname(currentDestPath);
    if (currentDestPath === newDestPath) break;
    currentDestPath = newDestPath;
  }

  return { hasScript, hasPackageLockJson };
}

export async function runNpmInstall(
  destPath: string,
  args: string[] = [],
  cmd?: string
) {
  assert(path.isAbsolute(destPath));

  let commandArgs = args;
  console.log(`installing to ${destPath}`);
  const { hasPackageLockJson } = await scanParentDirs(destPath);

  const opts: SpawnOptions = {
    env: {
      ...process.env,
    },
  };

  if (hasPackageLockJson) {
    commandArgs = args.filter(a => a !== '--prefer-offline');
    await spawnAsync(
      cmd || 'npm',
      commandArgs.concat(['install', '--unsafe-perm']),
      destPath,
      opts
    );
  } else {
    await spawnAsync(
      cmd || 'yarn',
      commandArgs.concat(['--ignore-engines', '--cwd', destPath]),
      destPath,
      opts
    );
  }
}

export async function runPackageJsonScript(
  destPath: string,
  scriptName: string,
  opts?: SpawnOptions
) {
  assert(path.isAbsolute(destPath));
  const { hasScript, hasPackageLockJson } = await scanParentDirs(
    destPath,
    scriptName
  );
  if (!hasScript) return false;

  if (hasPackageLockJson) {
    console.log(`running "npm run ${scriptName}"`);
    await spawnAsync('npm', ['run', scriptName], destPath, opts);
  } else {
    console.log(`running "yarn run ${scriptName}"`);
    await spawnAsync(
      'yarn',
      ['--cwd', destPath, 'run', scriptName],
      destPath,
      opts
    );
  }

  return true;
}

/**
 * installDependencies() is deprecated.
 * Please use runNpmInstall() instead.
 */
export const installDependencies = deprecate(
  runNpmInstall,
  'installDependencies() is deprecated. Please use runNpmInstall() instead.'
);
