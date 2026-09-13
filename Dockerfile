FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/server/public ./dist/server/public
COPY SECOND_BRAIN_PLAYBOOK.md ./
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "dist/index.js"]