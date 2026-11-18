#!/usr/bin/env bash
set -eu -o pipefail
project='jovenes-que-unen-al-barrio'
token=$(gcloud auth print-access-token)
reply=$(curl --silent --show-error --max-time 45 \
  -H "Authorization: Bearer $token" \
  -H "X-Goog-User-Project: $project" \
  -H 'Content-Type: application/json' \
  --data '{"requestType":"PASSWORD_RESET","email":"coordinacion@acceso.imju.invalid","returnOobLink":true}' \
  "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:sendOobCode")
unset token
if ! jq -e '.oobLink | type == "string" and startswith("https://")' >/dev/null <<< "$reply"; then
  jq -r '.error.message // "Google no devolvió el enlace. Verifica que tu cuenta administre este proyecto."' <<< "$reply" >&2
  exit 1
fi
echo 'Abre este enlace privado para elegir tu contraseña de coordinación:'
jq -r '.oobLink' <<< "$reply"
