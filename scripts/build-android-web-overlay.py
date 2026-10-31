"""Build an additive release from a fresh, private production UI snapshot.

The deployment must compare baseline.json against the server before switching.
Historical assets stay on the server; only the active asset folder is copied.
"""
import hashlib
import json
import pathlib
import re
import shutil
import sys

repo = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()
release = sys.argv[3]
assert re.fullmatch(r'android-native-[A-Za-z0-9-]+', release)
assert source != output and not output.exists(), 'Use a new immutable output directory'
index = (source / 'index.html').read_text(encoding='utf8')
active = re.search(r'/assets/([^/]+)/app-shell\.css', index)[1]
assets = source / 'assets' / active
baseline = {str(p.relative_to(source)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in source.rglob('*') if p.is_file()}
shutil.copytree(source, output)
target = output / 'assets' / release
(output / 'assets' / active).rename(target)
# Rewrite Vite's absolute dependency tables as well as the HTML asset prefix.
for p in [output / 'index.html', *target.glob('*.js'), *target.glob('*.css')]:
    text = p.read_text(encoding='utf8').replace('assets/' + active + '/', 'assets/' + release + '/')
    if p.name == 'index.html':
        text = text.replace('</body>', f'<script type="module" src="/assets/{release}/android-web-bootstrap.js"></script>'
                            f'<script defer src="/assets/{release}/vivic-space-bridge.js"></script></body>')
        text = text.replace(f'content="{active}"', f'content="{release}"')
    # Source release clients validate this additive provider field strictly.
    text = text.replace('`rules`,`stepfun`,`gpt`,`rules-offline`', '`rules`,`stepfun`,`deepseek`,`gpt`,`rules-offline`')
    text = text.replace('"rules","stepfun","gpt","rules-offline"', '"rules","stepfun","deepseek","gpt","rules-offline"')
    p.write_text(text, encoding='utf8', newline='\n')
runtime = target / 'app-runtime.js'
text = runtime.read_text(encoding='utf8')
if ']})var ke=' in text:
    assert text.count(']})var ke=') == 1
    text = text.replace(']})var ke=', ']})};var ke=')
match = re.search(r'ze=`/api/space/owner`,([A-Za-z_$][\w$]*)=new Map', text)
assert match, 'Owner cache shape changed; inspect the fresh release'
text += f'\nexport function vivicOwnerServerVersion(id){{return {match[1]}.get(id)?.serverVersion}}\n'
runtime.write_text(text, encoding='utf8', newline='\n')
screen = target / 'screensaver.js'
text = screen.read_text(encoding='utf8')
anchor = ' },[isBlocked]);'
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + "\n React.useEffect(()=>{const remote=event=>{if(typeof event.detail?.sleeping!=='boolean')return;event.detail.sleeping?enter(true):wake();};window.addEventListener('vivic:remote-screen',remote);return()=>window.removeEventListener('vivic:remote-screen',remote);},[enter,wake]);")
screen.write_text(text, encoding='utf8', newline='\n')
with (target / 'screensaver.css').open('a', encoding='utf8') as f:
    f.write('\n.vivic-screensaver-underlay[inert] .react-flow,.vivic-screensaver-underlay[inert] .react-flow *{visibility:hidden!important}\n')
display = next(target.glob('DisplayApp-*.js'))
text = display.read_text(encoding='utf8')
base = re.search(r'export\{([\w$]+) as DisplayApp\};', text)[1]
factory = re.search(r'import\{t as ([\w$]+)\}from"\./react-CQOZoUwg.js"', text)[1]
text = "import {VivicScreensaverBoundary} from './screensaver.js';\n" + text
text = text.replace(f'export{{{base} as DisplayApp}};', '')
text += f'''
const VivicRemoteReact={factory}();
function VivicNativeDisplay(props){{
 const [host,setHost]=VivicRemoteReact.useState(null);
 VivicRemoteReact.useEffect(()=>{{let cancelled=false;const timer=setInterval(()=>{{const runtime=window.__vivicRemoteRuntime;if(runtime)runtime.getControlHost().then(value=>{{if(!cancelled){{setHost(value);clearInterval(timer);}}}}).catch(()=>{{}});}},100);return()=>{{cancelled=true;clearInterval(timer);}};}},[]);
 const child=VivicRemoteReact.createElement({base},props);
 return host?VivicRemoteReact.createElement(VivicScreensaverBoundary,{{host,view:'display',busy:false}},child):child;
}}
export {{VivicNativeDisplay as DisplayApp}};
'''
display.write_text(text, encoding='utf8', newline='\n')
for filename, origin in [('android-web-bootstrap.js', repo / 'scripts/android-web-bootstrap.js'),
                         ('vivic-space-bridge.js', repo / 'apps/web/public/vivic-space-bridge.js')]:
    shutil.copyfile(origin, target / filename)
inject = output / 'assets/model-settings-ui-20261031-2/inject.js'
text = inject.read_text(encoding='utf8')
text = text.replace('var PANEL_ID = "vivic-model-platform-panel";', '''var vmpAccount=fetch('/api/space/session',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(d){return d.authenticated?d.user.id:null;}).catch(function(){return null;});
  var PANEL_ID = "vivic-model-platform-panel";''')
text = text.replace('return fetch(path, options).then(function (res) {', '''return vmpAccount.then(function(account){if(account)options.headers['x-vivic-account']=account;return fetch(path, options);}).then(function (res) {''')
text = text.replace('if (!candidates.length) return null;', '''if (!candidates.length) return null;
    var preferred=candidates.find(function(p){return /^stepfun/.test(p.protocol);});if(preferred)return preferred;''')
text = text.replace('p.id !== provider.id && p.enabled !== false && (p.roles || []).indexOf("main") !== -1;', '''p.id !== provider.id && p.enabled !== false && (p.roles || []).indexOf("main") !== -1
        && !((/^stepfun/.test(provider.protocol) && p.presetId==='deepseek') || (provider.presetId==='deepseek' && /^stepfun/.test(p.protocol)));''')
# Keep the deployed generic settings UI. Explain the fallback inside its card.
anchor = 'var PANEL_ID = "vivic-model-platform-panel";'
assert anchor in text
text = text.replace(anchor, anchor + '''
  var fallbackTimer = setInterval(function () {
    var panel = document.getElementById('vivic-model-platform-panel');
    if (!panel || panel.querySelector('[data-vivic-fallback-hint]')) return;
    var hint=document.createElement('p');hint.setAttribute('data-vivic-fallback-hint','');
    hint.textContent='StepFun 优先，DeepSeek 自动备用。将两者都设为主模型即可；Key 仅保存在当前账号。';
    hint.style.cssText='font-size:12px;line-height:1.6;padding:0 16px;color:inherit;opacity:.7';panel.prepend(hint);
  },1000);
  window.addEventListener('pagehide',function(){clearInterval(fallbackTimer);},{once:true});
''')
inject.write_text(text, encoding='utf8', newline='\n')
(output / 'baseline.json').write_text(json.dumps({'release': release, 'active': active, 'files': baseline}, indent=2), encoding='utf8')
print(json.dumps({'release': release, 'baselineFiles': len(baseline), 'output': str(output)}))
