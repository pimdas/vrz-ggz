FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY lib ./lib
COPY beheer ./beheer
COPY test ./test
RUN npm test
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
