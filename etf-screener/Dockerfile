FROM node:20-alpine

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 복사
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# 포트
EXPOSE 3000

# 실행
CMD ["node", "backend/server.js"]
