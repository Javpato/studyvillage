/** Extract literal message keys, including conditional branches and lookup values.
 * Dynamic identifiers remain covered by the localized browser journeys. */
export function messageKeys(source){
 const keys=new Set(),calls=/\b(?:msg|t)\s*\(/g;let match;
 while((match=calls.exec(source))){let depth=0,previous='',atStart=true;
  for(let i=calls.lastIndex;i<source.length;i++){const ch=source[i];if(!depth&&(ch===')'||ch===','))break;
   if(ch==='"'||ch==="'"){let value='';for(i++;i<source.length&&source[i]!==ch;i++){if(source[i]==='\\'){i++;const escapes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'};value+=escapes[source[i]]??source[i];}else value+=source[i];}if(value&&(atStart||previous==='?'||previous===':'))keys.add(value);previous='literal';atStart=false;continue;}
   if('([{'.includes(ch))depth++;if(')]}'.includes(ch))depth--;if(!/\s/.test(ch)){previous=ch==='?'&&previous==='?'?'??':ch;atStart=false;}
  }
 }return keys;
}
