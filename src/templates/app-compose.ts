import { VeemConfig, ipToDashes } from '../config';

export function generateAppCompose(config: VeemConfig, tag: string): string {
  const ipDashes = ipToDashes(config.host);
  const domain = `${config.appName}.${ipDashes}.sslip.io`;
  const fullImage = `${config.imageName}:${tag}`;

  return `services:
  app:
    image: ${fullImage}
    restart: unless-stopped
    expose:
      - "${config.appPort}"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:${config.appPort}/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
      - traefik-public
      - internal
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
  traefik-public:
    external: true
  internal:
    driver: bridge
`;
}
