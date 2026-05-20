FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY knowledge ./knowledge
RUN pip install --upgrade pip && pip install .

EXPOSE 8000

CMD ["uvicorn", "ontology_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
