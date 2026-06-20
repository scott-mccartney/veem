import { VeemConfig, ipToDashes } from '../config';
import { VeemSSH } from '../ssh';
import { generateTraefikStaticConfig } from '../templates/traefik-static';
import { generateTraefikCompose } from '../templates/traefik-compose';
import { generatePostgresCompose } from '../templates/postgres-compose';
import * as logger from '../logger';

export interface InitOptions {
  withPostgres?: boolean;
  postgresPassword?: string;
}

export async function init(config: VeemConfig, options: InitOptions = {}): Promise<void> {
  const totalSteps = options.withPostgres ? 8 : 7;
  const ssh = new VeemSSH();

  logger.info(`Connecting to ${config.sshUser}@${config.host}...`);
  await ssh.connect(config.host, config.sshUser, config.sshKeyPath);
  logger.success('Connected');

  // Step 1: Update system
  logger.step(1, totalSteps, 'Updating system packages');
  await ssh.runSudo(
    'while ! flock -n /var/lib/apt/lists/lock true 2>/dev/null || ! flock -n /var/lib/dpkg/lock-frontend true 2>/dev/null; do sleep 2; done && DEBIAN_FRONTEND=noninteractive apt-get update -q && apt-get upgrade -yq'
  );

  // Step 2: Install Docker
  logger.step(2, totalSteps, 'Installing Docker');
  await ssh.run('curl -fsSL https://get.docker.com | sh');
  await ssh.runSudo('apt-get install -yq docker-compose-plugin');

  // Step 3: Create deploy user
  logger.step(3, totalSteps, 'Creating deploy user');
  await ssh.runSudo('id deploy 2>/dev/null || adduser --disabled-password --gecos "" deploy');
  await ssh.runSudo('usermod -aG sudo,docker deploy');
  await ssh.runSudo('mkdir -p /home/deploy/.ssh');
  await ssh.runSudo('cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys');
  await ssh.runSudo(
    'chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys'
  );

  // Step 4: Configure firewall
  logger.step(4, totalSteps, 'Configuring UFW firewall');
  await ssh.runSudo('ufw allow OpenSSH');
  await ssh.runSudo('ufw allow 80/tcp');
  await ssh.runSudo('ufw allow 443/tcp');
  await ssh.runSudo('ufw --force enable');

  // Step 5: Create shared Docker network
  logger.step(5, totalSteps, 'Creating traefik-public Docker network');
  await ssh.runSudo('docker network create traefik-public 2>/dev/null || true');

  // Step 6: Upload Traefik config
  logger.step(6, totalSteps, 'Uploading Traefik configuration');
  await ssh.runSudo('mkdir -p /home/deploy/traefik/traefik');

  const traefikYml = generateTraefikStaticConfig(config.letsencryptEmail);
  const traefikCompose = generateTraefikCompose();

  await ssh.runSudo(`tee /home/deploy/traefik/traefik/traefik.yml > /dev/null << 'VEEM_EOF'\n${traefikYml}\nVEEM_EOF`);
  await ssh.runSudo('touch /home/deploy/traefik/traefik/acme.json && chmod 600 /home/deploy/traefik/traefik/acme.json');
  await ssh.runSudo(`tee /home/deploy/traefik/docker-compose.yml > /dev/null << 'VEEM_EOF'\n${traefikCompose}\nVEEM_EOF`);
  await ssh.runSudo('chown -R deploy:deploy /home/deploy/traefik');

  // Step 7: Start Traefik
  logger.step(7, totalSteps, 'Starting Traefik');
  await ssh.run('cd /home/deploy/traefik && sudo docker compose up -d');

  // Step 8 (optional): Postgres
  if (options.withPostgres) {
    if (!options.postgresPassword) {
      throw new Error('Postgres password required when --with-postgres is set');
    }
    logger.step(8, totalSteps, 'Setting up Postgres');
    await ssh.runSudo('docker network create db-internal 2>/dev/null || true');
    await ssh.runSudo('mkdir -p /home/deploy/postgres');

    const postgresEnv = `POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${options.postgresPassword}\nPOSTGRES_DB=postgres\n`;
    const postgresCompose = generatePostgresCompose();

    await ssh.runSudo(`tee /home/deploy/postgres/.env > /dev/null << 'VEEM_EOF'\n${postgresEnv}\nVEEM_EOF`);
    await ssh.runSudo('chmod 600 /home/deploy/postgres/.env');
    await ssh.runSudo(`tee /home/deploy/postgres/docker-compose.yml > /dev/null << 'VEEM_EOF'\n${postgresCompose}\nVEEM_EOF`);
    await ssh.runSudo('chown -R deploy:deploy /home/deploy/postgres');
    await ssh.run('cd /home/deploy/postgres && sudo docker compose up -d');
    logger.success('Postgres running on db-internal network (not exposed to host)');
  }

  const ipDashes = ipToDashes(config.host);
  logger.success(`Traefik is running. Dashboard: http://${config.host}:8888/dashboard/`);
  logger.success(`Deploy user created. Future SSH: ssh deploy@${config.host}`);
  logger.info(`Once your app is deployed, it will be available at: https://<appName>.${ipDashes}.sslip.io`);

  await ssh.disconnect();
}
