import { VeemConfig, ipToDashes } from '../config';

export function generateAppCompose(config: VeemConfig, tag: string): string {
  const ipDashes = ipToDashes(config.host);
  const domain = `${config.appName}.${ipDashes}.sslip.io`;
  const fullImage = `${config.imageName}:${tag}`;
  const usePostgres = config.usePostgres === true;

  const appNetworks = ['traefik-public', 'internal'];
  if (usePostgres) appNetworks.push('db-internal');

  const networkDecls = [
    '  traefik-public:',
    '    external: true',
  ];
  if (usePostgres) {
    networkDecls.push('  db-internal:', '    external: true');
  }
  networkDecls.push('  internal:', '    driver: bridge');

  return `services:
  app:
    image: ${fullImage}
    restart: unless-stopped
    env_file:
      - .env
    expose:
      - "${config.appPort}"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:${config.appPort}/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
${appNetworks.map((n) => `      - ${n}`).join('\n')}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${config.appName}.rule=Host(\`${domain}\`)"
      - "traefik.http.routers.${config.appName}.entrypoints=websecure"
      - "traefik.http.routers.${config.appName}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${config.appName}-http.rule=Host(\`${domain}\`)"
      - "traefik.http.routers.${config.appName}-http.entrypoints=web"
      - "traefik.http.routers.${config.appName}-http.middlewares=redirect-to-https"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
      - "traefik.http.services.${config.appName}.loadbalancer.server.port=${config.appPort}"

networks:
${networkDecls.join('\n')}
`;
}
