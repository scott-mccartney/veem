import { Command } from 'commander';
import { loadConfig, validateConfig, promptConfig, VeemConfig } from './config';
import { init } from './commands/init';
import { deploy } from './commands/deploy';
import { logs } from './commands/logs';
import { ps } from './commands/ps';
import * as logger from './logger';

async function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve) => {
    let input = '';
    const onData = (chunk: Buffer): void => {
      const ch = chunk.toString('utf8');
      if (ch === '\r' || ch === '\n') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === String.fromCharCode(3)) {
        process.exit(1);
      } else if (ch === String.fromCharCode(127) || ch === '\b') {
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const program = new Command();

program
  .name('veem')
  .description('VM provisioning and zero-downtime deployment CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Provision a fresh VM with Docker, Traefik, UFW, and a deploy user')
  .option('--host <ip>', 'VM IP address')
  .option('--ssh-user <user>', 'SSH user (default: root)')
  .option('--ssh-key <path>', 'Path to SSH private key')
  .option('--email <email>', "Email for Let's Encrypt")
  .option('--with-postgres', 'Also install a persistent Postgres on db-internal network')
  .option('--postgres-password <pw>', 'Postgres superuser password (prompted if omitted)')
  .action(async (opts) => {
    try {
      const overrides: Partial<VeemConfig> = {};
      if (opts.host) overrides.host = opts.host;
      if (opts.sshUser) overrides.sshUser = opts.sshUser;
      if (opts.sshKey) overrides.sshKeyPath = opts.sshKey;
      if (opts.email) overrides.letsencryptEmail = opts.email;

      let config = loadConfig(overrides);

      if (!config.host || !config.sshKeyPath || !config.letsencryptEmail) {
        config = await promptConfig();
      }

      validateConfig(config, ['host', 'sshUser', 'sshKeyPath', 'letsencryptEmail']);
      if (!config.sshUser) config.sshUser = 'root';

      let postgresPassword: string | undefined = opts.postgresPassword;
      if (opts.withPostgres && !postgresPassword) {
        postgresPassword = await promptHidden('Postgres superuser password: ');
        if (!postgresPassword) {
          throw new Error('Postgres password cannot be empty');
        }
      }

      await init(config, {
        withPostgres: opts.withPostgres === true,
        postgresPassword,
      });
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('deploy')
  .description('Build, push, and zero-downtime deploy the app to the VM')
  .option('--tag <tag>', 'Image tag (default: git SHA)')
  .option('--host <ip>', 'VM IP override')
  .option('--ssh-user <user>', 'SSH user override')
  .option('--ssh-key <path>', 'SSH key path override')
  .option('--image <name>', 'Docker image name override')
  .option('--env <suffix>', 'Upload .env.<suffix> as .env on the VM (default: .env)')
  .action(async (opts) => {
    try {
      const overrides: Partial<VeemConfig> = {};
      if (opts.host) overrides.host = opts.host;
      if (opts.sshUser) overrides.sshUser = opts.sshUser;
      if (opts.sshKey) overrides.sshKeyPath = opts.sshKey;
      if (opts.image) overrides.imageName = opts.image;

      const config = loadConfig(overrides);
      if (!config.sshUser) config.sshUser = 'deploy';

      validateConfig(config, ['host', 'sshUser', 'sshKeyPath', 'appName', 'appPort', 'imageName']);

      await deploy(config, opts.tag, opts.env);
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('Show logs for the deployed container on the VM')
  .option('-C, --container <name>', 'Container name (default: <appName>-app-1)')
  .option('-T, --tail', 'Follow log output (docker logs -f)')
  .option('--ssh-user <user>', 'SSH user override')
  .option('--ssh-key <path>', 'SSH key path override')
  .action(async (opts) => {
    try {
      const overrides: Partial<VeemConfig> = {};
      if (opts.sshUser) overrides.sshUser = opts.sshUser;
      if (opts.sshKey) overrides.sshKeyPath = opts.sshKey;

      const config = loadConfig(overrides);
      if (!config.sshUser) config.sshUser = 'deploy';

      validateConfig(config, ['host', 'sshUser', 'sshKeyPath', 'appName']);

      await logs(config, opts.container, opts.tail);
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('ps')
  .description('List all Docker containers on the VM')
  .option('--ssh-user <user>', 'SSH user override')
  .option('--ssh-key <path>', 'SSH key path override')
  .action(async (opts) => {
    try {
      const overrides: Partial<VeemConfig> = {};
      if (opts.sshUser) overrides.sshUser = opts.sshUser;
      if (opts.sshKey) overrides.sshKeyPath = opts.sshKey;

      const config = loadConfig(overrides);
      if (!config.sshUser) config.sshUser = 'deploy';

      validateConfig(config, ['host', 'sshUser', 'sshKeyPath']);

      await ps(config);
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
