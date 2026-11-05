const {test}=require('node:test');const assert=require('node:assert/strict');const {serverProfileFromArgs}=require('./server-profile.cjs');
test('terminal server profile saves an address without authority or secrets',()=>{
 assert.deepEqual(serverProfileFromArgs(['app','--add-server','https://example.org','--server-name=Study']),{url:'https://example.org',name:'Study'});
 assert.deepEqual(serverProfileFromArgs(['app','--add-server=http://127.0.0.1:8787']),{url:'http://127.0.0.1:8787',name:'127.0.0.1'});
 assert.equal(serverProfileFromArgs(['app']),null);
 for(const url of ['http://example.org','https://user:secret@example.org','file:///tmp/data','https://example.org?claim=secret'])assert.throws(()=>serverProfileFromArgs(['app','--add-server='+url]));
});
