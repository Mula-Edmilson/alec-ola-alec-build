// Test the installed resource with the bundled Node executable. Does not access external sites.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]);
const dir=path.join(root,'agent-runtime','node_modules');
for(const name of ['playwright','playwright-core']){
 const pkg=JSON.parse(await fs.readFile(path.join(dir,name,'package.json'),'utf8'));
 assert.equal(pkg.name,name);assert.equal(pkg.version,'1.65.1');
 await fs.access(path.join(dir,name,'LICENSE'));
}
const {chromium}=await import(pathToFileURL(path.join(dir,'playwright','index.mjs')).href);
const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true});
try{
 const context=await browser.newContext({javaScriptEnabled:false,acceptDownloads:false,serviceWorkers:'block',permissions:[]});
 try{
  const p=await context.newPage();
  await p.setContent('<h1>ALEC packaged Edge</h1>');
  assert.equal(await p.locator('h1').innerText(),'ALEC packaged Edge');
 }finally{await context.close();}
}finally{await browser.close();}
console.log('Installed pinned Playwright and Edge with sandbox verified');
