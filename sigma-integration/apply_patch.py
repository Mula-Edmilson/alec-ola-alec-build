#!/usr/bin/env python3
"""Patch only the audited Sigma checkout. No network, no commit."""
from pathlib import Path
import argparse
import subprocess
import shutil
PIN = 'd0da797fa1ded2f8601d0e065329da06b43971e9'
p = argparse.ArgumentParser()
p.add_argument('sigma_checkout', type=Path)
a = p.parse_args()
root = a.sigma_checkout.resolve()
if subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip() != PIN:
    raise SystemExit('Unsupported Sigma commit.')
lib = root / 'src-tauri/src/lib.rs'
cargo = root / 'src-tauri/Cargo.toml'
dest = lib.with_name('alec_file_bridge.rs')
src = Path(__file__).with_name('alec_file_bridge.rs')
original = lib.read_text(encoding='utf-8')
if 'version = "2.3.0"' not in cargo.read_text(encoding='utf-8'):
    raise SystemExit('Expected Sigma 2.3.0.')
markers = [('mod global_search;', 'mod global_search;\nmod alec_file_bridge;'), ('    system_tray::setup_system_tray(app.handle())?;', '    system_tray::setup_system_tray(app.handle())?;\n    alec_file_bridge::start(app.handle().clone());')]
if all(new in original for _,new in markers) and dest.exists() and dest.read_bytes()==src.read_bytes():
    print('Patch already applied.'); raise SystemExit(0)
if dest.exists() or any(new in original or original.count(old)!=1 for old,new in markers):
    raise SystemExit('Unexpected state; no changes made.')
if subprocess.check_output(['git','-C',str(root),'status','--porcelain'],text=True).strip():
    raise SystemExit('Use a clean disposable Sigma checkout.')
updated = original
for old,new in markers: updated=updated.replace(old,new,1)
backup=lib.with_name('lib.rs.alec-backup')
if backup.exists(): raise SystemExit('Backup already exists; no changes made.')
shutil.copy2(lib, backup)
try:
    shutil.copy2(src, dest)
    lib.write_text(updated,encoding='utf-8')
except Exception:
    shutil.copy2(backup,lib); dest.unlink(missing_ok=True); raise
print('Applied Sigma bridge. Backup:', backup)
