# Use official Playwright image with Node and browsers preinstalled
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Create volume for persistent browser data
VOLUME ["/app/user-data"]

CMD ["npm", "start"]
