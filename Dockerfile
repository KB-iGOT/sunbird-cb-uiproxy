FROM node:20 AS build

COPY --chown=node:node . .
RUN npm install
RUN npm run build

FROM node:20

WORKDIR /usr/src/app

# Dependencies for headless chrome - puppeteer
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  libnotify-dev libnss3 libxss1 libasound2 \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3 \
  libdrm2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 \
  fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/src/app/user_upload \
  /usr/src/app/logs && \
  chown -R node:node /usr/src/app

USER node
COPY --chown=node:node package*.json ./
RUN npm install --only=production && npm cache clean --force

COPY --chown=node:node --from=build dist/ .

EXPOSE 8080

CMD [ "node", "index.js" ]