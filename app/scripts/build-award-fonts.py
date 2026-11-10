from fontTools.ttLib import TTFont
from fontTools import subset
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'hackhub-app'
chars=set(range(0x20,0x250)) | set(range(0x2000,0x2070)) | set(range(0x3000,0x3040)) | set(range(0xff00,0xffef))
for a in range(0xa1,0xf8):
    for b in range(0xa1,0xff):
        try: chars.update(map(ord,bytes([a,b]).decode('gb2312')))
        except UnicodeDecodeError: pass
for path in (root/'src').rglob('*'):
    if path.suffix in ('.tsx','.ts','.css'): chars.update(map(ord,path.read_text()))
for weight in ['Regular','Bold']:
    font=TTFont('/usr/share/fonts/opentype/noto/NotoSansCJK-'+weight+'.ttc',fontNumber=2)
    options=subset.Options(); options.flavor='woff2'
    sub=subset.Subsetter(options=options); sub.populate(unicodes=chars); sub.subset(font)
    font.flavor='woff2'; path=root/'public/fonts'/('award-sans-'+weight.lower()+'.woff2');font.save(path)
    print(path.name,path.stat().st_size)
    # English copy and loading punctuation share a small subset; other glyphs retain the full font.
    latin=TTFont(path)
    latin_subset=subset.Subsetter(options=options)
    latin_subset.populate(unicodes=set(range(0x250)) | set(range(0x2000,0x2070)))
    latin_subset.subset(latin)
    latin_path=path.with_name('award-sans-'+weight.lower()+'-latin.woff2')
    latin.save(latin_path)
    print(latin_path.name,latin_path.stat().st_size)
(root/'public/fonts/LICENSE.txt').write_text(Path('/usr/share/doc/fonts-noto-cjk/copyright').read_text())
