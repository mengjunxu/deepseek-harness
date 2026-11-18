import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const root=await realpath(await mkdtemp(join(tmpdir(),'tboard-candidate-')))
const work=join(root,'work')
const next=join(work,'nested')
await mkdir(next,{recursive:true})
const requests=[]
const ids=['g0-attach','g0-continue']
const server=createServer(async(req,res)=>{
  let body=''
  for await (const chunk of req) body+=chunk
  const messages=JSON.stringify(JSON.parse(body).messages)
  const seen=ids.filter(x=>messages.includes(x))
  requests.push(seen)
  const frame=[
    {type:'message_start',message:{id:'g0model',model:'deepseek-v4-pro',usage:{input_tokens:2,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'text',text:'seen-'+seen.join('+')}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:1}},
    {type:'message_stop'},
  ]
  res.writeHead(200,{'content-type':'text/event-stream'})
  res.end(frame.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const instances=[]
function newRuntime(){
  const h=new DeepSeekHarness({
    cwd:work,processCwd:work,dshHome:join(root,'dsh'),profile:'sdk',
    model:'deepseek-v4-pro',provider:'deepseek-official',
    env:{HOME:root,PATH:process.env.PATH,DSH_TELEMETRY_DISABLED:'1',
      DEEPSEEK_API_KEY:'local-fixture', DEEPSEEK_BASE_URL:'http://127.0.0.1:'+server.address().port},
    initializeTimeoutMs:30000,requestTimeoutMs:10000,
  })
  instances.push(h)
  return h
}
const deadline=AbortSignal.timeout(80000)
const bounded=p=>Promise.race([p,new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(Error('probe deadline')),{once:true}))])
try {
  const first=newRuntime()
  const session=first.session('g0-official-resume')
  assert.equal(await session.getWorkingDirectory(),work)
  assert.equal(requests.length,0)
  const turn=await bounded(session.run(ids[0]))
  assert.equal(turn.finalResponse,'seen-'+ids[0])
  assert.equal(await session.setWorkingDirectory(next),next)
  await first.close()
  const second=newRuntime()
  const restored=await second.resumeSession(session.id)
  assert.equal(restored.id,session.id)
  assert.equal(await restored.getWorkingDirectory(),next)
  assert.deepEqual(requests,[[ids[0]]])
  const continued=await bounded(restored.run(ids[1]))
  assert.equal(continued.finalResponse,'seen-'+ids.join('+'))
  assert.deepEqual(requests,[[ids[0]],ids])
  await assert.rejects(second.resumeSession('g0-missing-session'))
  assert.equal(requests.length,2)
  console.log(JSON.stringify({restored:true,cwdRestored:true,historyInNextRequest:true,missingRejected:true,requests},null,2))
} finally {
  await Promise.allSettled(instances.map(h=>h.close()))
  server.closeAllConnections()
  await new Promise(resolve=>server.close(resolve))
  await rm(root,{recursive:true,force:true})
}
