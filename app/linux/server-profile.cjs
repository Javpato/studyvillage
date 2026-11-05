/** Parses a terminal shortcut as data. Never joins, claims administration, or evaluates commands. */
function serverProfileFromArgs(args) {
  const at=args.findIndex(value=>value==='--add-server'||value.startsWith('--add-server='));if(at<0)return null;
  const raw=args[at]==='--add-server'?args[at+1]:args[at].slice('--add-server='.length);
  if(typeof raw!=='string'||raw.length>300)throw new Error('Use --add-server https://your-server.example');
  const url=new URL(raw),local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(!(['https:','wss:'].includes(url.protocol)||local&&['http:','ws:'].includes(url.protocol))||url.username||url.password||url.search||url.hash)throw new Error('Use a secure server address without credentials or query parameters.');
  const nameArg=args.find(value=>value.startsWith('--server-name='));
  return {url:url.toString().replace(/\/$/,''),name:(nameArg?.slice('--server-name='.length)||url.hostname).slice(0,48)};
}
module.exports={serverProfileFromArgs};
