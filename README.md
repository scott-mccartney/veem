# veem

Provision a VM and deploy your app in two commands.

```sh
veem init    # provision the VM
veem deploy  # ship the app
```

## What it does

**`veem init`** connects to a fresh Ubuntu VM and sets it up for production: installs Docker, configures a firewall, creates a dedicated deploy user, and provisions Traefik as a reverse proxy with automatic HTTPS via Let's Encrypt.

**`veem deploy`** builds your Docker image locally, transfers it to the VM securely over SSH (no registry required), and starts your application using blue/green deployment — bringing up the new version before tearing down the old one so there's zero downtime.

## Install

```sh
npm install -g veem-cli
```

## Quick start
In your project directory, ensure there's a Dockerfile and the image can be built locally. Then run the following commands:
```
veem init
veem deploy
```

Your app will be live at `my-app.1-2-3-4.sslip.io` with a valid TLS certificate.

## Commands

### `veem init`

Provisions a fresh VM for production use.

| Option | Description |
|---|---|
| `--host <ip>` | VM IP address |
| `--ssh-user <user>` | SSH user (default: `root`) |
| `--ssh-key <path>` | Path to SSH private key |
| `--email <email>` | Email for Let's Encrypt |

If any required options are missing, `veem init` will prompt you interactively.

This command only needs to be run once per VM. If you want to deploy additional apps to the VM, you'll need to set up a `.veem.json` file manually in the other project's directory.

### `veem deploy`

Builds and deploys your app to the VM.

| Option | Description |
|---|---|
| `--tag <tag>` | Image tag (default: current git SHA) |
| `--host <ip>` | VM IP override |
| `--ssh-user <user>` | SSH user override (default: `deploy`) |
| `--ssh-key <path>` | SSH key path override |
| `--image <name>` | Docker image name override |

## Configuration

`veem` reads from a `.veem.json` file in your project root. Options passed via CLI flags take precedence.

```json
{
  "appName": "my-app",
  "appPort": 3000,
  "imageName": "my-app",
  "host": "1.2.3.4",
  "sshUser": "deploy",
  "sshKeyPath": "~/.ssh/id_rsa",
  "letsencryptEmail": "you@example.com"
}
```

Place a `.env` file in your project root and `veem deploy` will upload it to the VM automatically.

## License

MIT
