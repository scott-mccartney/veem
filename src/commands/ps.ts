import { VeemConfig } from '../config';
import { VeemSSH } from '../ssh';
import * as logger from '../logger';

export async function ps(config: VeemConfig): Promise<void> {
  const ssh = new VeemSSH();
  await ssh.connect(config.host, config.sshUser, config.sshKeyPath);
  logger.info('Listing containers...');

  try {
    await ssh.run('docker ps -a');
  } finally {
    await ssh.disconnect();
  }
}
