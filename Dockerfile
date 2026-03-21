FROM node:20

WORKDIR /usr/src/app

# Dependencies for headless chrome - puppeteer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libnotify-dev libnss3 libxss1 libasound2 \
      fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      libdrm2 libgbm1 libgconf-2-4 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/src/app/user_upload \
  /usr/src/app/logs && \
  chown -R node:node /usr/src/app

COPY --chown=node:node package*.json ./
USER node

RUN npm install --only=production
COPY --chown=node:node dist/ .

EXPOSE 8080

CMD [ "node", "index.js" ]