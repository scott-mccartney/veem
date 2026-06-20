export function generatePostgresCompose(): string {
  return `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - db-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $\${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:

networks:
  db-internal:
    external: true
`;
}
