FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_AWS_LOCATION_API_KEY
ARG NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-1
ARG NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard
ENV NEXT_PUBLIC_AWS_LOCATION_API_KEY=$NEXT_PUBLIC_AWS_LOCATION_API_KEY \
    NEXT_PUBLIC_AWS_LOCATION_REGION=$NEXT_PUBLIC_AWS_LOCATION_REGION \
    NEXT_PUBLIC_AWS_LOCATION_STYLE=$NEXT_PUBLIC_AWS_LOCATION_STYLE
RUN npm run build:server

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
