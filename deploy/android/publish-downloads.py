"""Publish only the signed, hash-checked Android artifact already staged on disk."""
import datetime
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

directory = pathlib.Path('/var/www/vivic-preview-downloads/android')
backend = pathlib.Path('/opt/vivic-preview-20261025/backend')
receipt = json.loads((backend / 'android-apk-receipt.json').read_text())
manifest = json.loads((directory / 'latest.json').read_text())
item = manifest['stable']['android']
assert receipt['debugging'] is False and receipt['testCa'] is False
assert receipt['abis'] == 'arm64-v8a,armeabi-v7a'
assert re.fullmatch(r'Vivic-Remote-[0-9.]+\.apk', receipt['apk'])
apk = directory / receipt['apk']
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
assert apk.stat().st_size == item['size'] == receipt['size'] <= 15 * 1024 * 1024
assert digest == item['sha256'] == receipt['sha256']
assert item['versionCode'] == receipt['versionCode'] and item['version'] == receipt['version']
assert item['url'] == 'https://vivic.edsionc.top/downloads/android/' + receipt['apk']
assert receipt['certificateSha256'] == '0c7ebd410f2eafb5b42b3f0a39062225c5c62d041fc9df8d6c741841b3dd65aa'
legacy = {'version': item['version'], 'file': 'Vivic-Remote.apk', 'bytes': item['size'], 'sha256': digest,
          'signing': {'certificateSha256': receipt['certificateSha256']}}
(directory / 'legacy.json').write_text(json.dumps(legacy, indent=2))
for item_file in [apk, directory / 'latest.json', directory / 'legacy.json']:
    item_file.chmod(0o644)
conf = pathlib.Path('/etc/nginx/conf.d/60-vivic-preview-20261025.conf')
original = conf.read_text()
block = re.search(r'    location = /downloads/Vivic-Remote\.apk \{.*?\n    \}', original, re.S)
assert block
updated_block = re.sub(r'alias /var/www/vivic-preview-downloads/[^;]+;', 'alias ' + str(apk) + ';', block.group())
updated_block = re.sub(r'filename="[^"]+"', 'filename="' + receipt['apk'] + '"', updated_block)
updated = original[:block.start()] + updated_block + original[block.end():]
if 'location ^~ /downloads/android/' not in updated:
    anchor = '    access_log off;'
    assert anchor in updated
    updated = updated.replace(anchor, '''    location ^~ /downloads/android/ {
        alias /var/www/vivic-preview-downloads/android/;
        types { application/vnd.android.package-archive apk; application/json json; }
        default_type application/octet-stream;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "no-store" always;
    }
    location = /downloads/android.json {
        alias /var/www/vivic-preview-downloads/android/legacy.json;
        default_type application/json;
        add_header Cache-Control "no-store" always;
    }
''' + anchor, 1)
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
shutil.copy2(conf, backend / ('nginx-before-android-download-' + stamp + '.conf'))
conf.write_text(updated)
try:
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    subprocess.run(['nginx', '-s', 'reload'], check=True, capture_output=True)
except Exception:
    conf.write_text(original)
    subprocess.run(['nginx', '-s', 'reload'], capture_output=True)
    raise
(backend / 'ANDROID_APK_DEPLOYED.json').write_text(json.dumps(receipt, indent=2))
print('ANDROID_DOWNLOAD_PUBLISHED', json.dumps({'version': receipt['version'], 'bytes': receipt['size'], 'sha256': digest}))
