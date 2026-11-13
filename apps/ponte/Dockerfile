# Ponte do Culto - versao web (o espelho que roda na VPS).
#
# O contexto de build e esta pasta (apps/ponte): a aplicacao fica em web/, mas
# serve arquivos de pc/ e monta o .zip de /baixar a partir dela.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --system --no-create-home --shell /usr/sbin/nologin ponte

WORKDIR /srv/ponte
COPY web/requirements.txt web/requirements.txt
RUN pip install --no-cache-dir -r web/requirements.txt
COPY web web
COPY pc pc

USER ponte
WORKDIR /srv/ponte/web
EXPOSE 8710

# UM PROCESSO SO (--workers 1): o estado do culto mora na memoria. Com dois,
# um receberia o retrato da igreja e o outro responderia a tela com o velho.
# Ouve em 0.0.0.0 DENTRO do conteiner; nenhuma porta e publicada no host.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8710", "--access-logfile", "-", "app:app"]
