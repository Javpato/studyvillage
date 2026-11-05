# Reports texts seen on screen in English that are still Spanish app text (see npm run i18n:audit).
import json,re,sys
d=json.load(open(sys.argv[1]))['texts']
en=json.load(open('app/src/i18n/en.json'))
keys=sorted([k for k,v in en.items() if v!=k and len(k)>=4 and re.search('[a-záéíóúñ]',k,re.I)],key=len,reverse=True)
out=[]
for t,where in d.items():
  raw=re.sub(r'^\[(canvas|value)\] ','',t)
  hit=next((k for k in keys if k==raw or (len(k)>=6 and re.search(r'(?<![A-Za-zÁ-ú])'+re.escape(k)+r'(?![A-Za-zÁ-ú])',raw))),None)
  acc=re.search(r'[áéíóúñ¿¡]',raw,re.I)
  if hit or acc: out.append((t,hit,where[0][:60]))
for t,k,w in sorted(out): print(repr(t[:100]),'| key:',repr((k or '')[:40]),'@',w)
print(len(out))
