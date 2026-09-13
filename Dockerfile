FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

FROM node:22-alpine
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/smashysubash/organize-notion-personal-agent"
LABEL org.opencontainers.image.description="Second Brain Personal Agent for Notion"
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY SECOND_BRAIN_PLAYBOOK.md ./
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "dist/index.js"]