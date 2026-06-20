import { execSync, spawnSync } from 'child_process';
import * as logger from './logger';

export function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    const now = new Date();
    return now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }
}

export function buildImage(imageName: string, tag: string): void {
  const fullTag = `${imageName}:${tag}`;
  logger.info(`Building ${fullTag}`);
  const result = spawnSync(
    'docker',
    ['build', '--platform', 'linux/amd64', '-t', fullTag, '.'],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`docker build failed`);
  }
}

export function saveImage(imageName: string, tag: string, tarPath: string): void {
  const fullTag = `${imageName}:${tag}`;
  logger.info(`Saving ${fullTag} to ${tarPath}`);
  // gzip the uncompressed `docker save` stream to shrink the SSH transfer.
  // pipefail so a docker save failure isn't masked by gzip's exit code.
  const result = spawnSync(
    'bash',
    ['-c', `set -o pipefail; docker save ${fullTag} | gzip > ${tarPath}`],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`docker save failed`);
  }
}
