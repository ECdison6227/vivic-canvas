"""Run on the Vivic server after uploading the verified overlay and baseline.

Uses the shared deployment lock and exact baseline hashes. Keeps the previous
release intact and restores both the symlink and nginx config on failure.
"""
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile

root = pathlib.Path('/opt/vivic-preview-20261025')
backend = root / 'backend'
baseline = json.loads((backend / 'android-web-baseline.json').read_text())
release = baseline['release']
assert re.fullmatch(r'android-native-[A-Za-z0-9-]+', release)
lock = (backend / 'deploy.lock').open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
current = (root / 'frontend-current').resolve()
changed = [name for name, digest in baseline['files'].items()
           if not (current / name).is_file() or hashlib.sha256((current / name).read_bytes()).hexdigest() != digest]
if changed:
    print('FRONTEND_BASELINE_CHANGED', changed)
    raise SystemExit(3)
conf = pathlib.Path('/etc/nginx/conf.d/60-vivic-preview-20261025.conf')
original_conf = conf.read_text()
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
backup = backend / ('frontend-before-android-final-' + stamp + '.tar.gz')
subprocess.run(['tar', '-czf', str(backup), '-C', str(current), 'index.html',
                'assets/' + baseline['active'], 'assets/model-settings-ui-20261031-2'], check=True)
shutil.copy2(conf, backend / ('nginx-before-android-' + stamp + '.conf'))
folder = root / 'releases' / release
assert not folder.exists()
web = folder / 'web'
(web / 'assets').mkdir(parents=True)
for item in current.iterdir():
    if item.name not in ['index.html', 'assets']:
        os.symlink(str(item.resolve()), str(web / item.name))
for item in (current / 'assets').iterdir():
    if item.name not in [release, 'model-settings-ui-20261031-2']:
        os.symlink(str(item.resolve()), str(web / 'assets' / item.name))
archive = backend / 'android-web-publish.tar.gz'
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        assert not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts
        assert not member.issym() and not member.islnk()
subprocess.run(['tar', '-xzf', str(archive), '-C', str(web), '--no-same-owner'], check=True)
patch = backend / 'android-web-patch.tar.gz'
if patch.exists():
    with tarfile.open(patch) as tar:
        for member in tar.getmembers():
            assert not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts
            assert not member.issym() and not member.islnk()
    subprocess.run(['tar', '-xzf', str(patch), '-C', str(web), '--no-same-owner'], check=True)
index_upload = backend / 'android-web-index.html'
if index_upload.exists():
    assert hashlib.sha256(index_upload.read_bytes()).hexdigest() == baseline['outputIndexSha256']
    (web / 'index.html').write_bytes(index_upload.read_bytes())
for name, digest in baseline['outputFiles'].items():
    assert hashlib.sha256((web / name).read_bytes()).hexdigest() == digest, 'Published artifact differs: ' + name
headers = re.findall(r'include (/opt/vivic-preview-20261025/releases/[^;]+frontend-headers.conf);', original_conf)
assert headers and len(set(headers)) == 1
old_header = pathlib.Path(headers[0])
new_header = folder / 'frontend-headers.conf'
new_header.write_text(old_header.read_text().replace(baseline['active'], release))
conf.write_text(original_conf.replace(str(old_header), str(new_header)))
try:
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    next_link = root / 'frontend-android-next'
    assert not next_link.exists()
    os.symlink(str(web), str(next_link))
    os.replace(str(next_link), str(root / 'frontend-current'))
    subprocess.run(['nginx', '-s', 'reload'], check=True, capture_output=True)
except Exception:
    conf.write_text(original_conf)
    if (root / 'frontend-current').resolve() != current:
        rollback = root / 'frontend-android-rollback'
        os.symlink(str(current), str(rollback))
        os.replace(str(rollback), str(root / 'frontend-current'))
    subprocess.run(['nginx', '-s', 'reload'], capture_output=True)
    raise
receipt = {'release': release, 'previous': str(current), 'backup': str(backup), 'time': stamp,
           'indexSha256': hashlib.sha256((web / 'index.html').read_bytes()).hexdigest()}
(backend / 'ANDROID_FRONTEND_DEPLOYED.json').write_text(json.dumps(receipt, indent=2))
print('FRONTEND_DEPLOY_OK', json.dumps(receipt))
