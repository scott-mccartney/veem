import { VeemConfig } from '../config';
import { VeemSSH } from '../ssh';
import * as logger from '../logger';

export async function logs(config: VeemConfig, container?: string, tail?: boolean): Promise<void> {
  const containerName = container ?? `${config.appName}-app-1`;

  const ssh = new VeemSSH();
  await ssh.connect(config.host, config.sshUser, config.sshKeyPath);
  logger.info(`Fetching logs for container: ${containerName}`);

  try {
    await ssh.run(`docker logs${tail ? ' -f' : ''} ${containerName}`);
  } finally {
    await ssh.disconnect();
  }
}
