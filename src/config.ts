import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

export interface VeemConfig {
  host: string;
  sshUser: string;
  sshKeyPath: string;
  appName: string;
  appPort: number;
  imageName: string;
  letsencryptEmail: string;
}

const CONFIG_FILE = '.veem.json';

export function loadConfig(overrides: Partial<VeemConfig> = {}): VeemConfig {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  let fileConfig: Partial<VeemConfig> = {};

  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const merged = { ...fileConfig, ...overrides };

  if (merged.sshKeyPath) {
    merged.sshKeyPath = merged.sshKeyPath.replace(/^~/, os.homedir());
  }

  return merged as VeemConfig;
}

export function validateConfig(config: Partial<VeemConfig>, required: (keyof VeemConfig)[]): void {
  const missing = required.filter((k) => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}\n` +
        `Add them to .veem.json or pass as CLI flags.`
    );
  }
}

export function ipToDashes(ip: string): string {
  return ip.replace(/\./g, '-');
}

export async function promptConfig(): Promise<VeemConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  console.log('\nNo .veem.json found. Let\'s set it up:\n');

  const config: VeemConfig = {
    host: await ask('VM IP address: '),
    sshUser: (await ask('SSH user [root]: ')) || 'root',
    sshKeyPath: (await ask(`SSH key path [~/.ssh/id_ed25519]: `)) || '~/.ssh/id_ed25519',
    appName: await ask('App name (used as subdomain): '),
    appPort: parseInt((await ask('App internal port [8080]: ')) || '8080', 10),
    imageName: await ask('Docker image name (e.g. my-api or myorg/my-api): '),
    letsencryptEmail: await ask("Let's Encrypt email: "),
  };

  rl.close();

  config.sshKeyPath = config.sshKeyPath.replace(/^~/, os.homedir());

  fs.writeFileSync(path.join(process.cwd(), CONFIG_FILE), JSON.stringify(config, null, 2));
  console.log(`\nSaved to ${CONFIG_FILE}\n`);

  return config;
}
