"""Build native resources from the project's original Hark assets and Vivic orb code palette."""
from pathlib import Path
import argparse, html, json, math, shutil, sys, xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--tools', type=Path, help='Optional private pip target containing fonttools, brotli and pillow')
args = parser.parse_args()
if args.tools:
    sys.path.insert(0, str(args.tools.resolve()))
from fontTools.ttLib import TTFont
from PIL import Image

root = Path(__file__).resolve().parents[3]
source = root / 'apps/web/src/components/hark'
res = root / 'apps/android-native/app/src/main/res'
for folder in ['drawable', 'drawable-nodpi', 'font', 'values', 'mipmap-anydpi-v26', 'mipmap-anydpi-v33', 'mipmap-xxxhdpi']:
    (res / folder).mkdir(parents=True, exist_ok=True)
for theme in ['light', 'dark']:
    shutil.copyfile(source / f'assets/sky-{theme}.webp', res / f'drawable-nodpi/sky_{theme}.webp')
for weight in ['regular', 'medium', 'semibold', 'bold']:
    font = TTFont(source / f'assets/gt-standard-l-standard-{weight}.woff2')
    font.flavor = None
    font.recalcTimestamp = False
    font.save(res / f'font/gt_{weight}.ttf')

glyphs = json.loads((source / 'glyphs.json').read_text(encoding='utf-8'))
names = []
for name, svg in glyphs.items():
    ident = 'hark_' + name.replace('-', '_')
    paths = []
    for node in ET.fromstring('<svg>' + svg + '</svg>').iter('path'):
        paths.append(f'<path android:fillColor="#FF000000" android:fillType="{ "evenOdd" if node.get("fill-rule") == "evenodd" else "nonZero" }" android:pathData="{html.escape(node.get("d"), quote=True)}"/>')
    if not paths:
        continue
    (res / f'drawable/{ident}.xml').write_bytes(('<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="16dp" android:height="16dp" android:viewportWidth="16" android:viewportHeight="16">' + ''.join(paths) + '</vector>\n').encode())
    names.append((name, ident))
kt = root / 'apps/android-native/app/src/main/java/app/vivic/remote/ui/icons/HarkGlyphs.kt'
kt.parent.mkdir(parents=True, exist_ok=True)
aliases = {'clock':'schedule','note':'edit','news':'web','screen':'computer'}
kt.write_bytes(('package app.vivic.remote.ui.icons\n\nimport app.vivic.remote.R\n\n// Generated from the original project glyphs.json by scripts/generate-assets.py.\nfun harkGlyph(name: String): Int = when (name) {\n' + ''.join(f'    "{name}" -> R.drawable.{ident}\n' for name, ident in names) + ''.join(f'    "{name}" -> R.drawable.hark_{target}\n' for name,target in aliases.items()) + '    "sun" -> R.drawable.native_sun\n    else -> R.drawable.hark_chat\n}\n').encode())
(res/'drawable/native_sun.xml').write_bytes(b'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="16dp" android:height="16dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#00000000" android:strokeColor="#FF000000" android:strokeWidth="2" android:strokeLineCap="round" android:pathData="M12,8 A4,4 0,1 1,12,16 A4,4 0,1 1,12,8 M12,2 L12,4 M12,20 L12,22 M4.93,4.93 L6.34,6.34 M17.66,17.66 L19.07,19.07 M2,12 L4,12 M20,12 L22,12 M4.93,19.07 L6.34,17.66 M17.66,6.34 L19.07,4.93"/></vector>\n')

def rgb(l, c, h):
    angle = math.radians(h); a, b = c * math.cos(angle), c * math.sin(angle)
    ll = (l + .3963377774*a + .2158037573*b)**3
    mm = (l - .1055613458*a - .0638541728*b)**3
    ss = (l - .0894841775*a - 1.291485548*b)**3
    linear = [4.0767416621*ll-3.3077115913*mm+.2309699292*ss, -1.2684380046*ll+2.6097574011*mm-.3413193965*ss, -.0041960863*ll-.7034186147*mm+1.707614701*ss]
    return [max(0,min(1,12.92*v if v<=.0031308 else 1.055*max(0,v)**(1/2.4)-.055)) for v in linear]

palette = [rgb(.68,.21,350), rgb(.70,.18,210), rgb(.66,.20,285), rgb(.72,.19,325)]
def orb(size, radius_ratio=.40, transparent=False):
    image=Image.new('RGBA',(size,size),(0,0,0,0 if transparent else 255)); px=image.load(); radius=size*radius_ratio
    for y in range(size):
        for x in range(size):
            xx,yy=(x-size/2)/radius,(y-size/2)/radius; rr=math.hypot(xx,yy)
            if rr>1: continue
            weights=[math.exp(-((xx-.5)**2+(yy+.25)**2)*2.1),math.exp(-((xx+.5)**2+(yy+.3)**2)*2.0),math.exp(-((xx-.1)**2+(yy-.65)**2)*2.5),.30+max(0,math.sin(math.atan2(yy,xx)*2+rr*4))*.30]
            total=sum(weights); color=[sum(palette[k][j]*weights[k] for k in range(4))/total for j in range(3)]
            highlight=math.exp(-((xx+.3)**2+(yy+.52)**2)*8)*.65
            shade=.74+.26*math.sqrt(max(0,1-rr*rr)); alpha=round(255*min(1,(1-rr)*size/2))
            px[x,y]=tuple(round(255*min(1,(v*shade)*(1-highlight)+highlight)) for v in color)+(alpha,)
    return image

orb(512).save(res / 'mipmap-xxxhdpi/ic_launcher.png')
orb(432,.30,True).save(res / 'drawable-nodpi/icon_foreground.png')
orb(256,.43,True).save(res / 'drawable-nodpi/splash_orb.png')
(res/'values/icon_colors.xml').write_bytes(b'<resources><color name="icon_background">#000000</color></resources>\n')
for version in [26,33]:
    mono='<monochrome android:drawable="@drawable/icon_monochrome"/>' if version>=33 else ''
    (res/f'mipmap-anydpi-v{version}/ic_launcher.xml').write_bytes(('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/icon_background"/><foreground android:drawable="@drawable/icon_foreground"/>'+mono+'</adaptive-icon>\n').encode())
(res/'drawable/icon_monochrome.xml').write_bytes(b'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#FFFFFFFF" android:pathData="M54,22 A32,32 0,1 1,54,86 A32,32 0,1 1,54,22 Z"/></vector>\n')
print(f'Generated {len(names)} original glyphs, four fonts, two skies and native orb icons.')
