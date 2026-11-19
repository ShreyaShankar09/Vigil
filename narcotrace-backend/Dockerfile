FROM python:3.11-slim

WORKDIR /app
RUN apt-get -o Acquire::http::Pipeline-Depth=0 -o Acquire::Retries=5 update \
    && apt-get -o Acquire::http::Pipeline-Depth=0 -o Acquire::Retries=5 install -y --no-install-recommends \
    fontconfig fonts-noto-core fonts-noto-extra libpango-1.0-0 libpangoft2-1.0-0 \
    libharfbuzz-subset0 libgdk-pixbuf-2.0-0 libcairo2 shared-mime-info \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
