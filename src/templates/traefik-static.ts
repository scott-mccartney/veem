export function generateTraefikStaticConfig(letsencryptEmail: string): string {
  return `api:
  dashboard: true
  insecure: true

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
    network: traefik-public

certificatesResolvers:
  letsencrypt:
    acme:
      email: ${letsencryptEmail}
      storage: /acme.json
      httpChallenge:
        entryPoint: web
`;
}
