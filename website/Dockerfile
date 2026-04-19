FROM node:22-alpine AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY api ./api
COPY main.py ./main.py
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8080

CMD ["sh", "-c", "gunicorn main:app --bind 0.0.0.0:${PORT:-8080}"]
