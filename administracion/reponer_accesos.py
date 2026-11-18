"""Reposición de accesos iniciales del IMJU. Ejecutar como propietario en Cloud Shell."""
import csv
import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

PROJECT = "jovenes-que-unen-al-barrio"
AUTH = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}"
DB = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
OUTPUT = Path.home() / "Accesos_IMJU_privados.csv"
FIELDS = ["usuario", "clave_temporal", "uid", "estado", "fecha_clave_original"]

def main(token=None, output=OUTPUT):
    os.umask(0o077)
    token = token or subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()

    def api(url, body=None):
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json",
                   "x-goog-user-project": PROJECT}
        req = Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
        with urlopen(req, timeout=45) as response:
            return json.load(response)

    def access(uid):
        return api(DB + "/accesos/" + quote(uid, safe=""))["fields"]

    def eligible(fields):
        return fields.get("activo", {}).get("booleanValue") is True and fields.get("listo", {}).get("booleanValue") is False

    def lookup(uid):
        return api(AUTH + "/accounts:lookup", {"localId": [uid]})["users"][0]

    def version(user):
        return str(user.get("passwordUpdatedAt", ""))

    def save(rows):
        with tempfile.NamedTemporaryFile(mode="w", dir=output.parent, encoding="utf-8-sig", newline="", delete=False) as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
            f.flush()
            os.fsync(f.fileno())
        os.replace(f.name, output)

    if output.exists():
        with output.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != FIELDS:
                raise ValueError("El archivo de destino existe y tiene otro formato.")
            rows = list(reader)
    else:
        rows = []
        page = ""
        while True:
            result = api(DB + "/accesos?pageSize=100" + ("&pageToken=" + quote(page, safe="") if page else ""))
            for doc in result.get("documents", []):
                if not eligible(doc["fields"]):
                    continue
                uid = doc["name"].split("/")[-1]
                user = lookup(uid)
                email = user.get("email", "")
                if user.get("disabled") or not email.endswith("@acceso.imju.invalid"):
                    continue
                changed = version(user)
                # También protege una contraseña elegida antes de que el portal haya guardado 'listo'.
                if not changed or abs(float(changed) - float(user["createdAt"])) > 2000:
                    continue
                rows.append(dict(usuario=email.split("@")[0], uid=uid, clave_temporal=secrets.token_urlsafe(20),
                                 estado="pendiente", fecha_clave_original=changed))
            page = result.get("nextPageToken")
            if not page:
                break
        save(rows)
    for row in rows:
        if row["estado"] != "pendiente":
            continue
        uid = row["uid"]
        user = lookup(uid)
        if not eligible(access(uid)) or user.get("disabled") or version(user) != row["fecha_clave_original"]:
            row["estado"] = "revisar"
        else:
            api(AUTH + "/accounts:update", {"localId": uid, "password": row["clave_temporal"]})
            row["estado"] = "emitida"
        save(rows)
    print("Claves emitidas:", sum(r["estado"] == "emitida" for r in rows))
    print("Distribuye únicamente las filas con estado emitida. Guarda el CSV en un lugar privado.")
    print("Archivo:", output)

if __name__ == "__main__":
    main()
