# Secrets with SOPS + age (NFR-08, 09 §11.2)

Secrets live encrypted in `secrets/*.enc.yaml`; plaintext `.env` / `prod.env` / `secrets/*.yaml` are gitignored.
`.sops.yaml` (repo root) lists the team's **public** age keys; the file in the repo holds placeholders.

```bash
age-keygen -o ~/.config/sops/age/keys.txt        # once per member; share only the "age1…" public key
# add the public key to .sops.yaml, then:
sops --encrypt secrets/prod.yaml > secrets/prod.enc.yaml && rm secrets/prod.yaml
sops secrets/prod.enc.yaml                        # edit in place
sops exec-env secrets/prod.enc.yaml \
  'docker compose -f backend/docker-compose.prod.yml --env-file /dev/null up -d'   # secrets only in the process env
sops updatekeys secrets/prod.enc.yaml             # after removing a member — then ROTATE the real secrets
```

`secrets/prod.yaml` holds the keys of `backend/prod.env.example` (POSTGRES_PASSWORD, KAPTAN_APP_PASSWORD,
REDIS_PASSWORD, JWT_SECRET, PASSPHRASE_HASH, METRICS_TOKEN, provider keys). Backups can be encrypted to the
same public keys: `AGE_RECIPIENTS="age1… age1…"` for `backend/ops/backup.sh`.

Never commit an `AGE-SECRET-KEY-1…` line: gitleaks (`.gitleaks.toml`, CI job `secrets`) blocks it.
