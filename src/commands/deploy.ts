import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VeemConfig, ipToDashes } from '../config';
import { VeemSSH } from '../ssh';
import { generateAppCompose } from '../templates/app-compose';
import { buildImage, saveImage, getGitSha } from '../docker';
import * as logger from '../logger';

function sh(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

const HEALTH_POLL_INTERVAL_MS = 5000;
const HEALTH_TIMEOUT_MS = 120000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy(ssh: VeemSSH, appName: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  logger.info('Waiting for new container to become healthy...');

  while (Date.now() < deadline) {
    await sleep(HEALTH_POLL_INTERVAL_MS);
    const result = await ssh.run(
      `docker ps --filter "name=${appName}" --filter "health=healthy" --format "{{.Names}}" 2>/dev/null | head -1`
    );
    if (result.trim()) {
      logger.success(`Container healthy: ${result.trim()}`);
      return;
    }
  }

  throw new Error(`Timed out waiting for container to become healthy after ${HEALTH_TIMEOUT_MS / 1000}s. Check: docker logs ${appName}-app-1`);
}

async function isAppRunning(ssh: VeemSSH, appDir: string): Promise<boolean> {
  const result = await ssh.run(
    `cd ${appDir} && docker compose ps --format json 2>/dev/null | head -1`
  );
  return result.trim().length > 0;
}

export async function deploy(config: VeemConfig, tagOverride?: string, envFile?: string): Promise<void> {
  const tag = tagOverride ?? getGitSha();
  const appDir = `~/apps/${config.appName}`;

  // Phase 1: Local build
  logger.step(1, 4, 'Building Docker image');
  buildImage(config.imageName, tag);

  // Phase 2: Save image to tar
  logger.step(2, 4, 'Saving image to tar');
  const safeName = config.imageName.replace(/[^a-z0-9]/gi, '-');
  const localTar = path.join(os.tmpdir(), `veem-${safeName}-${tag}.tar`);
  saveImage(config.imageName, tag, localTar);

  // Phase 3: Remote deploy
  logger.step(3, 4, 'Connecting to VM');
  const ssh = new VeemSSH();
  await ssh.connect(config.host, config.sshUser, config.sshKeyPath);
  logger.success('Connected');

  logger.step(4, 4, 'Deploying to VM');

  const remoteTar = `/tmp/veem-${safeName}-${tag}.tar`;
  try {
    logger.info('Uploading image tar...');
    await ssh.uploadFile(localTar, remoteTar);
    logger.info('Loading image on VM...');
    await ssh.run(`docker load -i ${remoteTar}`);
    await ssh.run(`rm -f ${remoteTar}`);
  } finally {
    try { fs.unlinkSync(localTar); } catch {}
  }

  await ssh.run(`mkdir -p ${appDir}`);

  let databaseUrlBlock = '';
  if (config.usePostgres) {
    const postgresRunning = await ssh.runQuiet(
      `docker ps --filter "name=postgres" --filter "status=running" --format "{{.Names}}" | head -1`
    );
    if (!postgresRunning) {
      throw new Error(
        'usePostgres is set but no running postgres container was found on the VM. Re-run `veem init --with-postgres` first.'
      );
    }

    const dbName = config.postgresDb ?? config.appName;
    const password = await ssh.runQuiet(
      "grep '^POSTGRES_PASSWORD=' ~/postgres/.env | head -1 | cut -d= -f2-"
    );
    if (!password) {
      throw new Error('Could not read POSTGRES_PASSWORD from ~/postgres/.env on the VM');
    }

    logger.info(`Ensuring database "${dbName}" exists...`);
    await ssh.runQuiet(
      `docker exec ${postgresRunning} psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || docker exec ${postgresRunning} createdb -U postgres ${dbName}`
    );

    const url = `postgres://postgres:${encodeURIComponent(password)}@postgres:5432/${dbName}`;
    databaseUrlBlock = `\n# veem-managed\nDATABASE_URL=${url}\n`;
    logger.info(`Wiring DATABASE_URL → postgres://postgres:***@postgres:5432/${dbName}`);
  }

  const composeContent = generateAppCompose(config, tag);
  await ssh.run(`tee ${appDir}/docker-compose.yml > /dev/null << 'VEEM_EOF'\n${composeContent}\nVEEM_EOF`);

  const envFileName = envFile ? `.env.${envFile}` : '.env';
  const localEnv = path.resolve(process.cwd(), envFileName);
  let envContent: string | undefined;
  if (fs.existsSync(localEnv)) {
    envContent = fs.readFileSync(localEnv, 'utf8');
    logger.info(`Uploading ${envFileName} as .env`);
  } else if (envFile) {
    throw new Error(`Env file not found: ${localEnv}`);
  } else if (config.usePostgres) {
    envContent = '';
    logger.info('No local .env found — uploading veem-managed DATABASE_URL only');
  } else {
    logger.warn('No local .env found — skipping upload');
  }

  if (envContent !== undefined) {
    const merged = envContent + databaseUrlBlock;
    await ssh.run(`tee ${appDir}/.env > /dev/null << 'VEEM_EOF'\n${merged}\nVEEM_EOF`);
    await ssh.run(`chmod 600 ${appDir}/.env`);
  }

  const running = await isAppRunning(ssh, appDir);

  if (running) {
    logger.info('App is running — performing zero-downtime update');
    await ssh.run(`cd ${appDir} && docker compose up -d --no-deps --scale app=2 app`);
    await waitForHealthy(ssh, config.appName);
    await ssh.run(`cd ${appDir} && docker compose up -d --no-deps --scale app=1 app`);
    await ssh.run('docker container prune -f');
  } else {
    logger.info('Fresh deployment — starting app');
    await ssh.run(`cd ${appDir} && docker compose up -d`);
  }

  await ssh.run('docker image prune -f');

  const ipDashes = ipToDashes(config.host);
  const url = `https://${config.appName}.${ipDashes}.sslip.io`;
  logger.success(`Deployed: ${url}`);

  await ssh.disconnect();
}
