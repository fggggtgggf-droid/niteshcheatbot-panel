FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=10000
ENV PANEL_API_BASE=https://niteshcheatbot.vercel.app/api
ENV PUBLIC_PANEL_URL=https://niteshcheatbot.vercel.app

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["python", "bot_start.py"]
