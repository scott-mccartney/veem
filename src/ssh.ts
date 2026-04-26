import { NodeSSH } from 'node-ssh';
import * as info from './logger';

export class VeemSSH {
  private ssh = new NodeSSH();

  async connect(host: string, user: string, keyPath: string): Promise<void> {
    await this.ssh.connect({ host, username: user, privateKeyPath: keyPath });
  }

  async run(command: string, label?: string): Promise<string> {
    if (label) info.info(label);
    let output = '';
    const result = await this.ssh.execCommand(command, {
      onStdout: (chunk) => {
        const text = chunk.toString();
        process.stdout.write(text);
        output += text;
      },
      onStderr: (chunk) => {
        process.stderr.write(chunk.toString());
      },
    });
    if (result.code !== 0) {
      throw new Error(`Command failed (exit ${result.code}): ${command}`);
    }
    return output.trim();
  }

  async runSudo(command: string, label?: string): Promise<string> {
    return this.run(`sudo ${command}`, label);
  }

  async uploadContent(content: string, remotePath: string): Promise<void> {
    // Use printf to avoid heredoc issues with special characters in content
    const escaped = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''");
    await this.run(`mkdir -p $(dirname ${remotePath}) && printf '%s' '${escaped}' > ${remotePath}`);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.ssh.putFile(localPath, remotePath);
  }

  async disconnect(): Promise<void> {
    this.ssh.dispose();
  }
}
