import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { DeepSeekHarness } from '../../../../packages/sdk/client/lib/index.js'

const root = await realpath(await mkdtemp(join(tmpdir(), 'taskboard-stop-')))
const runs = []
const model = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const messages = JSON.stringify(payload.messages)
  const label = ['alpha', 'beta'].find(name => messages.includes('G0-' + name))
  const first = !messages.includes('tool_result')
  const command = 'echo $$ > child.pid; exec /bin/sleep 40'
  const frames = [
    {type:'message_start', message:{id:'g0-'+label, model:'deepseek-v4-pro', usage:{input_tokens:1,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:first?{type:'tool_use',id:'g0tool',name:'bash',input:{}}:{type:'text',text:'done'}},
    ...(first?[{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify({command,description:'Wait in the isolated runtime for the stop check'})}}]:[]),
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:first?'tool_use':'end_turn'},usage:{output_tokens:1}},
    {type:'message_stop'},
  ]
  res.writeHead(200, {'content-type':'text/event-stream'})
  res.end(frames.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''))
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
function observe(pid) {
  try {
    return execFileSync('/bin/ps',['-p',String(pid),'-o','stat=','-o','command='],{encoding:'utf8'}).trim()
  } catch(error) {
    if (error.status === 1) return ''
    throw error
  }
}
async function start(label) {
  const cwd=join(root,label)
  await mkdir(cwd)
  const h=new DeepSeekHarness({profile:'sdk',dshHome:join(root,'home-'+label),processCwd:cwd,cwd,
    model:'deepseek-v4-pro',provider:'deepseek-official',
    env:{HOME:root,PATH:process.env.PATH,DSH_TELEMETRY_DISABLED:'1',DEEPSEEK_API_KEY:'local-fixture',DEEPSEEK_BASE_URL:'http://127.0.0.1:'+model.address().port}})
  const run=h.run('G0-'+label,{sessionId:'stop-'+label}).then(x=>({ended:x.finalResponse,events:x.events.filter(e=>e.type==='tool/result')}),e=>({error:e.message}))
  runs.push({h,run})
  const deadline=Date.now()+15000
  while(Date.now()<deadline) {
    try {
      const pid=Number((await readFile(join(cwd,'child.pid'),'utf8')).trim())
      assert.ok(Number.isSafeInteger(pid) && pid>0)
      if(observe(pid).includes('/bin/sleep 40'))return {h,pid}
    } catch(error) { if(error.code!=='ENOENT')throw error }
    await delay(50)
  }
  throw Error('sleep process never started: '+JSON.stringify(await Promise.race([run,delay(20,'pending')])).slice(0,1000))
}
try {
  const a=await start('alpha'), b=await start('beta')
  assert.notEqual(a.pid,b.pid)
  const before=Date.now()
  assert.equal(await a.h.client.waitForExit(30),false)
  await a.h.client.request('shutdown',{},5000)
  assert.equal(await a.h.client.waitForExit(5000),true)
  const after=observe(a.pid)
  const peer=observe(b.pid)
  assert.equal(after,'','target child still exists after SDK close: '+after)
  assert.match(peer,/\/bin\/sleep 40/)
  await b.h.close()
  assert.equal(observe(b.pid),'')
  console.log(JSON.stringify({normalShutdownAcknowledged:true,targetRuntimeExited:true,targetChildGone:true,peerStillRunning:true,peerChildGoneAfterOwnClose:true,totalStopMs:Date.now()-before},null,2))
} finally {
  await Promise.allSettled(runs.map(r=>r.h.close()))
  model.closeAllConnections()
  await new Promise(resolve=>model.close(resolve))
  await rm(root,{recursive:true,force:true})
}
