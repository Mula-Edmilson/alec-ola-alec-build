#!/usr/bin/env python3
"""ALEC LAB: aplica 6 ficheiros allowlist à copia integral do Roamies v0.1.50.

NUNCA toca na instalacao do Roamies nem no helper de voz.
Trava caso qualquer conteudo da tag base nao corresponda aos SHA do upstream auditado.
"""
import argparse
import json
import subprocess
from pathlib import Path

SHA = {
    "showcase/tauri/sidecar/local.mjs": "69d0fdd4e1baa2a2cab646f95bbab92aa93ea9cf",
    "showcase/tauri/sidecar/sidekick.mjs": "27e5f4082d0b29d4d51383673420b58163672a71",
    "showcase/panel/panel.js": "5673224d05a6261a1cfa805a0e2d1af7796e2ba7",
    "showcase/tauri/sidecar/test/local.test.mjs": "0c065a24756033890273ed6e27507a479c9bee72",
}
ADD = [
    "showcase/tauri/sidecar/alec-modelmode.mjs",
    "showcase/tauri/sidecar/test/alec-modelmodes.test.mjs",
]

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--overrides",required=True)
    p.add_argument("--report",required=True)
    a=p.parse_args()
    src=Path(a.source).resolve()
    overrides=Path(a.overrides).resolve()
    if not (src / ".git").exists():
        raise SystemExit("Recusado: projecto de destino nao e checkout Git integral.")
    version=json.loads((src / "showcase/tauri/src-tauri/tauri.conf.json").read_text(encoding="utf8"))["version"]
    if version!="0.1.50":raise SystemExit("Recusado: versao precisa ser 0.1.50.")
    tag=subprocess.check_output(["git","-C",str(src),"describe","--tags","--exact-match","HEAD"],text=True).strip()
    if tag!="v0.1.50":raise SystemExit("Recusado: checkout nao aponta para tag v0.1.50.")
    if subprocess.check_output(["git","-C",str(src),"status","--porcelain"],text=True).strip():
        raise SystemExit("Recusado: o checkout de destino tem alteracoes existentes.")
    expected=set(SHA)|set(ADD)
    provided={str(x.relative_to(overrides)).replace("\\","/") for x in overrides.rglob("*") if x.is_file()}
    if provided!=expected:
        raise SystemExit(f"Recusado: ficheiros fora da allowlist. Extra={provided-expected}, falta={expected-provided}")
    for rel,sha in SHA.items():
        path=src/rel
        actual=subprocess.check_output(["git","-C",str(src),"hash-object",rel],text=True).strip()
        if actual!=sha:raise SystemExit(f"Recusado: upstream divergente {rel}: {actual}")
    for rel in ADD:
        if (src/rel).exists():raise SystemExit(f"Recusado: ficheiro novo ja existe: {rel}")
    # Verifica TUDO primeiro, só depois comeca a escrever.
    report=["ROAMIES 0.1.50 LAB: ancoras conferidas; copiar apenas allowlist"]
    for rel in sorted(expected):
        dst=src/rel; dst.parent.mkdir(parents=True,exist_ok=True)
        dst.write_bytes((overrides/rel).read_bytes())
        report.append(rel)
    # Compara pasta de voz original e verifica que nao mexemos em mais nada.
    changed=set(subprocess.check_output(["git","-C",str(src),"diff","--name-only"],text=True).splitlines())
    if changed!=set(SHA):raise SystemExit(f"Alteracoes inesperadas: {changed ^ set(SHA)}")
    report.append("VOICE-WIN: NAO ALTERADO")
    dest=Path(a.report);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text("\n".join(report)+"\n",encoding="utf8")
    print("\n".join(report))
if __name__=="__main__":
    main()
