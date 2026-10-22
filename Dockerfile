FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100

WORKDIR /app

# Crea virtualenv
RUN python -m venv $VIRTUAL_ENV

# Upgrade strumenti DENTRO il venv
RUN pip install --upgrade pip setuptools wheel

# Copia requirements
COPY requirements.txt .

# Installa dipendenze nel venv (hardened)
RUN pip install \
    --retries 10 \
    --timeout 100 \
    --prefer-binary \
    --index-url https://pypi.org/simple \
    -r requirements.txt

# Copia codice
COPY . .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
