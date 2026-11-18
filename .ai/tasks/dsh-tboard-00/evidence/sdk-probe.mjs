import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { DeepSeekHarness } from '../../../../packages/sdk/client/lib/index.js'

// The only model endpoint is this loopback fixture. All SDK methods, profile launches
// and Session writes come from the production build.
const root = await realpath(await mkdtemp(join(tmpdir(), 'tboard-sdk-')))
const ids = ['session-tboard-a', 'session-tboard-b']
const counts = []
const held = Promise.withResolvers()
const server = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const messages = JSON.stringify(JSON.parse(body).messages)
  const marker = ['FIRST_A','FIRST_B','HOLD_A','AFTER_STOP_B'].filter(m => messages.includes(m)).at(-1)
  counts.push(marker)
  if (marker === 'HOLD_A') {
    held.resolve()
    return
  }
  const frames = [
    {type:'message_start',message:{id:'g0',model:'deepseek-v4-pro',usage:{input_tokens:3,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'text',text:'reply-'+marker}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:1}},
    {type:'message_stop'},
  ]
  res.writeHead(200, {'content-type':'text/event-stream'})
  res.end(frames.map(frame=>'event: '+frame.type+'\ndata: '+JSON.stringify(frame)+'\n\n').join(''))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const env = {
  HOME: root, PATH: process.env.PATH, DSH_TELEMETRY_DISABLED:'1',
  DEEPSEEK_API_KEY:'local-fixture', DEEPSEEK_BASE_URL:'http://127.0.0.1:'+server.address().port,
}
const owned = []
async function runtime(i) {
  const cwd=join(root,'work-'+i)
  await mkdir(cwd,{recursive:true})
  const h=new DeepSeekHarness({profile:'sdk',dshHome:join(root,'home-'+i),processCwd:cwd,cwd,
    provider:'deepseek-official',model:'deepseek-v4-pro',env, initializeTimeoutMs:25000,requestTimeoutMs:10000})
  owned.push(h)
  await h.start()
  return h
}
async function confirmTurn(h,i,marker) {
  const turn=await h.run(marker,{sessionId:ids[i]})
  assert.equal(turn.finalResponse,'reply-'+marker)
  assert.ok(turn.events.some(e=>e.type==='agent/inbox/spliced'))
  return {id:turn.sessionId,receipt:true,finalResponse:turn.finalResponse}
}
async function logSummary(i) {
  const dir=join(root,'home-'+i,'sessions')
  const files=(await readdir(dir,{recursive:true})).filter(f=>f.endsWith('.jsonl.zstd')).sort()
  const hash=createHash('sha256')
  const headers=[]
  for(const f of files) {
    const bytes=await readFile(join(dir,f))
    hash.update(f).update(bytes)
    for(const line of zstdDecompressSync(bytes).toString().trim().split('\n')) {
      const e=JSON.parse(line)
      if(e.type==='session') headers.push({id:e.id,cwdMatches:e.cwd===join(root,'work-'+i)})
    }
  }
  assert.ok(headers.some(h=>h.id===ids[i] && h.cwdMatches))
  return {headers,files:files.length,sha256:hash.digest('hex')}
}
const results={}
const timeout=AbortSignal.timeout(55000)
function bounded(p) {
  return Promise.race([p,new Promise((_,reject)=>timeout.addEventListener('abort',()=>reject(Error('probe deadline')),{once:true}))])
}
try {
  const a=await runtime(0)
  const b=await runtime(1)
  results.created=[await bounded(confirmTurn(a,0,'FIRST_A')),await bounded(confirmTurn(b,1,'FIRST_B'))]
  const active=a.run('HOLD_A',{sessionId:ids[0]}).then(()=> 'settled',()=> 'interrupted')
  await bounded(held.promise)
  await a.close()
  results.closedWhileActive=await bounded(active)
  assert.equal(results.closedWhileActive,'interrupted')
  results.survivingPeer=await bounded(confirmTurn(b,1,'AFTER_STOP_B'))
  await b.close()
  const before=await logSummary(0)
  results.peerHeader=(await logSummary(1)).headers
  const fresh=await runtime(0)
  results.reopenedWithoutPrompt={}
  results.api={resumeSession:typeof fresh.resumeSession,onRequest:typeof fresh.client.onRequest}
  for(const method of ['session/resume','session/query','session/working-directory/get']) {
    try {await fresh.client.request(method,{sessionId:ids[0]});throw Error('unexpected success')}
    catch(e) {assert.match(e.message,/unknown DeepSeek Harness SDK runtime method/);results.reopenedWithoutPrompt[method]=e.message}
  }
  await fresh.close()
  assert.equal((await logSummary(0)).sha256,before.sha256)
  assert.deepEqual(counts,['FIRST_A','FIRST_B','HOLD_A','AFTER_STOP_B'])
  results.firstHeader=before.headers
  results.reopenPreservesJournal=true
  results.loopbackRequests=counts
  console.log(JSON.stringify(results,null,2))
} finally {
  await Promise.allSettled(owned.map(h=>h.close()))
  server.closeAllConnections()
  await new Promise(resolve=>server.close(resolve))
  await rm(root,{recursive:true,force:true})
}
