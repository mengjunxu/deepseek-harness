import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {access,mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DeepSeekHarness} from '../../../../packages/sdk/client/lib/index.js'

const root=await realpath(await mkdtemp(join(tmpdir(),'tboard-interaction-')))
const work=join(root,'work')
await mkdir(work)
const plugin=join(root,'gate.mjs'), patch=join(root,'test.patch.yml')
await writeFile(plugin,`export const inject=['tools']
export function apply(ctx){ctx.on('tools/pre-execute',async (exec,next)=>{
  const decision=await next()
  return exec.name==='write' && decision.kind==='allow' ? {kind:'ask',reason:'G0 test file write'} : decision
})}
`)
await writeFile(patch,'- insert:\n    - id: g0-write-approval\n      name: '+JSON.stringify(plugin)+'\n')
let scenario, call
const expected=['allowed-once','rejected','cancelled','bad-result']
const observations=[]
const waiting=Promise.withResolvers(),late=Promise.withResolvers()
const server=createServer(async(req,res)=>{
  let body=''
  for await(const chunk of req)body+=chunk
  const payload=JSON.parse(body)
  const tool='write'
  const first=call++===0
  const input={file_path:join(work,scenario+'.txt'),content:'test-write'}
  if(first && !payload.tools.some(t=>t.name===tool)){res.writeHead(400);res.end('missing fixture tool '+tool);return}
  if(call>3){res.writeHead(400);res.end('loop');return}
  const block=first?{type:'tool_use',id:'tool-g0',name:tool,input:{}}:{type:'text',text:'done'}
  const frames=[
    {type:'message_start',message:{id:'g0',model:'deepseek-v4-pro',usage:{input_tokens:2,output_tokens:0}}},
    {type:'content_block_start',index:0,content_block:block},
    ...(first?[{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}}]:[]),
    {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:first?'tool_use':'end_turn'},usage:{output_tokens:1}},{type:'message_stop'},
  ]
  res.writeHead(200,{'content-type':'text/event-stream'})
  res.end(frames.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const h=new DeepSeekHarness({cwd:work,processCwd:work,dshHome:join(root,'home'),profile:'sdk',patches:[patch],
  provider:'deepseek-official',model:'deepseek-v4-pro',approvalRequests:true,
  env:{HOME:root,PATH:process.env.PATH,DSH_TELEMETRY_DISABLED:'1',DEEPSEEK_API_KEY:'local-fixture',DEEPSEEK_BASE_URL:'http://127.0.0.1:'+server.address().port},

})
const deadline=AbortSignal.timeout(60000)
try {
  h.client.start()
  h.client.onRequest(async(method,p)=>{
    assert.equal(method,'approval/request')
    assert.equal(p.sessionId,'g0-'+scenario)
    assert.equal(p.toolName,'write')
    assert.ok(p.callId)
    if(scenario==='late'){ waiting.resolve();return late.promise }
    assert.ok(expected.includes(scenario))
    observations.push({case:scenario,tool:p.toolName})
    return {outcome:scenario}
  })
  for(scenario of expected){
    call=0
    const turn=await Promise.race([h.run(scenario,{sessionId:'g0-'+scenario}),new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(Error('deadline')),{once:true}))])
    assert.equal(observations.at(-1)?.case,scenario,JSON.stringify(turn.events.filter(e=>e.type.includes('tool')).slice(-3)).slice(0,1200))
    {
      const file=join(work,scenario+'.txt')
      assert.ok(turn.events.some(e=>e.type==='approval/decided' && e.data.outcome===(scenario==='bad-result'?'unavailable':scenario)))
      if(scenario==='allowed-once')assert.equal(await readFile(file,'utf8'),'test-write')
      else await assert.rejects(access(file),{code:'ENOENT'})
    }
  }
  assert.deepEqual(observations.map(x=>x.case),expected)
  scenario='late'
  call=0
  const stopped=h.run('late',{sessionId:'g0-late'}).catch(()=>undefined)
  const untilDeadline=p=>Promise.race([p,new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(Error('deadline')),{once:true}))])
  await untilDeadline(waiting.promise)
  await untilDeadline(h.close())
  late.resolve({outcome:'allowed-once'})
  await untilDeadline(stopped)
  await assert.rejects(access(join(work,'late.txt')),{code:'ENOENT'})
  observations.push({case:'grant-after-close',fileWritten:false})
  console.log(JSON.stringify(observations,null,2))
}finally{
  await h.close()
  server.closeAllConnections()
  await new Promise(resolve=>server.close(resolve))
  await rm(root,{recursive:true,force:true})
}
