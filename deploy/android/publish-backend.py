"""Run on the server after uploading the committed source archive and baseline."""
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import time

root = pathlib.Path('/opt/vivic-preview-20261025/backend')
expected = json.loads((root / 'android-backend-baseline.json').read_text())
archive = subprocess.run(['docker', 'exec', 'vivic-preview-20261027', 'tar', '-czf', '-', '-C', '/app', 'apps/local-api/src'],
                         capture_output=True, check=True).stdout
actual = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar.getmembers():
        if member.isfile() and not pathlib.PurePosixPath(member.name).name.startswith('._'):
            actual[member.name] = hashlib.sha256(tar.extractfile(member).read()).hexdigest()
changed = sorted(name for name in set(actual) | set(expected) if actual.get(name) != expected.get(name))
if changed:
    print('BACKEND_BASELINE_CHANGED', changed)
    raise SystemExit(3)
container = json.loads(subprocess.run(['docker', 'inspect', 'vivic-preview-20261027'], capture_output=True, text=True, check=True).stdout)[0]
revision = (root / 'android-publish-revision.txt').read_text().strip()
assert re.fullmatch('[a-f0-9]{40}', revision)
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
env_file = root / 'env.list'
backup = root / ('env-before-android-final-' + stamp + '.list')
shutil.copy2(env_file, backup)
backup.chmod(0o600)
values = dict(line.split('=', 1) for line in env_file.read_text().splitlines() if '=' in line)
private = root / 'android-default-models-private.json'
private.chmod(0o600)
models = json.loads(private.read_text())
values.update({'VIVIC_STEPFUN_API_KEY': models['stepfun']['apiKey'],
               'VIVIC_STEPFUN_BASE_URL': models['stepfun']['baseUrl'], 'VIVIC_STEPFUN_MODEL': models['stepfun']['model']})
voice = root / 'android-voice.env'
voice.chmod(0o600)
values.update(dict(line.split('=', 1) for line in voice.read_text().splitlines() if '=' in line))
env_file.write_text(''.join(key + '=' + value + '\n' for key, value in values.items()))
env_file.chmod(0o600)
# Preserve the previous encrypted deployment defaults. Account-private providers
# are never opened here; their user choices remain independent of this template.
default_file = pathlib.Path('/var/lib/vivic-preview-20261025/providers.json')
default_backup = root / ('providers-before-android-final-' + stamp + '.json')
if default_file.exists():
    shutil.copy2(default_file, default_backup)
    default_backup.chmod(0o600)
script = '''import {ProviderStore} from './src/providers/store.ts';
const defaults=new ProviderStore({dataDir:'/data/vivic'}), keys=KEYS;
for(const brand of ['deepseek','stepfun']){
 const key=keys[brand];const old=defaults.list().find(p=>brand==='stepfun'?p.protocol.startsWith('stepfun'):/^https:\\/\\/api\\.deepseek\\.com(?:\\/v1)?\\/?$/.test(p.baseUrl));
 const input={name:brand==='stepfun'?'StepFun':'DeepSeek',presetId:brand==='stepfun'?'stepfun-plan':'deepseek',protocol:brand==='stepfun'?'stepfun-plan':'openai-compatible',baseUrl:key.baseUrl,model:key.model,apiKey:key.apiKey,roles:['main'],enabled:true};
 if(old)defaults.update(old.id,input);else defaults.create(input);
}
console.log('operator-defaults-encrypted');'''.replace('KEYS', json.dumps(models))
configured = subprocess.run(['docker', 'exec', '-i', 'vivic-preview-20261027', 'node', '--import', 'tsx', '--input-type=module'],
                            input=script, text=True, capture_output=True)
if configured.returncode:
    shutil.copy2(backup, env_file)
    raise RuntimeError('Could not configure encrypted operator defaults')
environment = os.environ.copy()
environment['VIVIC_EXPECTED_IMAGE_ID'] = container['Image']
lease_file = root / 'android-active-lease.json'
if lease_file.exists():
    lease = json.loads(lease_file.read_text())
    if lease.get('acquired') and time.time() - lease['started'] < 600 and not pathlib.Path(lease['release']).exists():
        os.kill(lease['pid'], 0)
        environment['VIVIC_DEPLOY_LOCK_HELD'] = '1'
print('BASELINE_MATCH; deploying', revision, flush=True)
result = subprocess.run(['bash', str(root / 'deploy-android-native.sh'), revision], env=environment)
if result.returncode:
    shutil.copy2(backup, env_file)
    if default_backup.exists():
        shutil.copy2(default_backup, default_file)
    raise SystemExit(result.returncode)
(root / 'ANDROID_NATIVE_CONTRACT.json').write_text(json.dumps({
    'branch': 'feat/android-native', 'revision': revision, 'time': stamp,
    'required': ['account-scoped encrypted providers', 'StepFun to DeepSeek inference failover',
                 '/api/credentials/deepseek/*', '/api/space/native/spaces/*',
                 '/api/space/events', '/api/space/display/*'],
    'deployment': 'Refresh and merge the active container source before subsequent deployments.'}, indent=2))
print('ANDROID_BACKEND_DEPLOYED', revision)
