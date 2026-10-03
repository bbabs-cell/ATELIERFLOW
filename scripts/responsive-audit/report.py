import json, glob, collections, re
over=collections.defaultdict(set); clip=collections.defaultdict(set); small=collections.defaultdict(set); errs=[]; po={}
for f in sorted(glob.glob('audit-output/out/*.json')):
    d=json.load(open(f)); L=d['label']
    for r in d['results']:
        if r.get('error'): errs.append((L,r['name'],r['error'][:90]))
        if r.get('pageOverflow',0)>0: po[(L,r['name'])]=r['pageOverflow']
        key=lambda x: re.sub(r'\s*\[.*\]$','',re.sub(r'\(\d+×\d+\)','',x))
        for x in r.get('overflow',[]): over[(r['name'],key(x))].add(L)
        for x in r.get('clipped',[]): clip[(r['name'],x)].add(L)
        if not L.startswith('d'):
            for x in r.get('small',[]): small[key(x).strip()].add(L)
    if d['errors']: errs.append((L,'pageerror',d['errors'][:2]))
print('== erreurs', errs)
print('== scroll horizontal de page', po)
print('== débordements'); [print(' ',k, sorted(v)) for k,v in sorted(over.items())]
print('== texte coupé'); [print(' ',k, sorted(v)) for k,v in sorted(clip.items())]
print('== petites cibles (mobile/tablette), nb tailles'); [print(' ',len(v),k[:110]) for k,v in sorted(small.items(), key=lambda kv:-len(kv[1]))]
