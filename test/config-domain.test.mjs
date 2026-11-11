import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';

test('new domain replaces only default endpoints, preserving credentials, preferences and explicit overrides', async () => {
  const dir=await mkdtemp(join(tmpdir(),'zesia-domain-'));
  const path=join(dir,'config.json');
  try {
    const env={ZESIA_CONFIG:path,ZESIA_TOKEN:'synthetic'};
    assert.equal((await readConfig(env)).url,'https://api.zesia.dev');
    for(const url of ['https://zesia-consult.cprindex.workers.dev','https://zesia-consult.cprindex.workers.dev/']){
      const stored={url,token:'kept-token',confirmBeforeSend:false};
      await writeFile(path,JSON.stringify(stored));
      const migrated=await readConfig({ZESIA_CONFIG:path});
      assert.equal(migrated.url,'https://api.zesia.dev');assert.equal(migrated.token,'kept-token');assert.equal(migrated.confirmBeforeSend,false);
      assert.deepEqual(JSON.parse(await readFile(path,'utf8')),stored,'reads do not rewrite private config');
      assert.equal((await readConfig({...env,ZESIA_URL:url})).url,url,'explicit environment URL is respected');
    }
    await writeFile(path,JSON.stringify({url:'https://custom.example'}));
    assert.equal((await readConfig(env)).url,'https://custom.example');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
