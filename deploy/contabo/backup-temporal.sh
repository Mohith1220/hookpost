#!/usr/bin/env bash
# Backup of the Temporal, Temporal visibility and Tablamigo databases.
# Runs from /etc/cron.d/hookpost-temporal-backup (every 6 hours, as root).
#
# Retention is a sliding window: every database keeps only its newest KEEP
# dumps. Each new dump pushes the oldest one out, and old dumps are removed
# only after all three new dumps succeeded, so a failed run never deletes
# anything.
#
# Off-site copies go ONLY to a private bucket set via PRIVATE_BACKUP_BUCKET,
# PRIVATE_BACKUP_ACCESS_KEY and PRIVATE_BACKUP_SECRET_KEY. Never to
# hookpost-media: that bucket is public through media.hookstep.in, and dumps
# uploaded there were downloadable until 3 Oct 2026.
set -euo pipefail

ENV_FILE=/home/flexiple_jr/hookpost/.env
OUT=/home/flexiple_jr/backups
KEEP=10
DBS="temporal temporal_visibility tablamigo"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
PGPASSWORD=$(cat /root/.temporal_db_password 2>/dev/null || sudo cat /root/.temporal_db_password)
export PGPASSWORD

mkdir -p "$OUT"
chmod 700 "$OUT"
umask 077

# 1. Dump each database to a temp file, then rename, so a half-written dump
#    never counts towards the window.
pg_dump -h 127.0.0.1 -U temporal -d temporal -Fc -f "$OUT/.temporal-${STAMP}.tmp"
pg_dump -h 127.0.0.1 -U temporal -d temporal_visibility -Fc -f "$OUT/.temporal_visibility-${STAMP}.tmp"
su - postgres -c "pg_dump -d tablamigo -Fc" > "$OUT/.tablamigo-${STAMP}.tmp"
for db in $DBS; do
  mv "$OUT/.${db}-${STAMP}.tmp" "$OUT/${db}-${STAMP}.dump"
done
chmod 600 "$OUT"/*.dump

# 2. Optional off-site copy to a PRIVATE bucket only.
if [ -n "${PRIVATE_BACKUP_BUCKET:-}" ]; then
  if [ "$PRIVATE_BACKUP_BUCKET" = "${CLOUDFLARE_BUCKETNAME:-}" ]; then
    echo "refusing to upload: $PRIVATE_BACKUP_BUCKET is the public media bucket" >&2
    exit 1
  fi
  export AWS_ACCESS_KEY_ID="$PRIVATE_BACKUP_ACCESS_KEY"
  export AWS_SECRET_ACCESS_KEY="$PRIVATE_BACKUP_SECRET_KEY"
  export AWS_DEFAULT_REGION=auto
  ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
  for db in $DBS; do
    aws s3 cp "$OUT/${db}-${STAMP}.dump" "s3://${PRIVATE_BACKUP_BUCKET}/db-backups/${db}/${STAMP}.dump" \
      --endpoint-url "$ENDPOINT" --only-show-errors
    # same sliding window off-site: keep the newest KEEP objects per database
    aws s3 ls "s3://${PRIVATE_BACKUP_BUCKET}/db-backups/${db}/" --endpoint-url "$ENDPOINT" \
      | awk '{print $4}' | sort -r | tail -n +$((KEEP + 1)) \
      | while read -r key; do
          aws s3 rm "s3://${PRIVATE_BACKUP_BUCKET}/db-backups/${db}/${key}" --endpoint-url "$ENDPOINT" --only-show-errors
        done
  done
fi

# 3. Local sliding window: keep the newest KEEP dumps per database. File names
#    carry a UTC timestamp, so a reverse name sort is newest first.
for db in $DBS; do
  ls -1 "$OUT"/"${db}"-*.dump 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | xargs -r rm -f --
done
# leftovers from a run that died mid-dump
find "$OUT" -name '.*.tmp' -mmin +60 -delete

for db in $DBS; do
  echo "$(date -u +%FT%TZ) ${db}: $(ls -1 "$OUT"/"${db}"-*.dump | wc -l) kept, newest ${db}-${STAMP}.dump ($(du -h "$OUT/${db}-${STAMP}.dump" | cut -f1))"
done
