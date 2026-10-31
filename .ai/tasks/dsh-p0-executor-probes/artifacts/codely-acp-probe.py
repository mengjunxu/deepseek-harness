import os,json,subprocess,tempfile,threading,queue,time,signal
from pathlib import Path
out=[]
with tempfile.TemporaryDirectory(prefix='dsh-p0-acp-') as d:
 env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','TMPDIR']};env.update(HOME=d,CODELY_HOME=d+'/codely',CUSTOM_AUTH='1',OPENAI_API_KEY='p0-fake-local-only')
 p=subprocess.Popen(['codely','--experimental-acp','--no-upm','--no-telemetry','--auth-type','openai','--openai-base-url','http://127.0.0.1:9/v1','--model','p0-mock','--approval-mode','plan'],cwd=d,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
 q=queue.Queue()
 def read():
  for line in p.stdout:
   try:q.put(json.loads(line))
   except ValueError:pass
 threading.Thread(target=read,daemon=True).start()
 def call(id,method,params):
  p.stdin.write(json.dumps({'jsonrpc':'2.0','id':id,'method':method,'params':params})+'\n');p.stdin.flush()
  deadline=time.monotonic()+12
  while time.monotonic()<deadline:
   try:r=q.get(timeout=.5)
   except queue.Empty:continue
   if r.get('id')==id:out.append({'method':method,'response':r});return r
  out.append({'method':method,'timeout':True});return {}
 r=call(1,'initialize',{'protocolVersion':1,'clientCapabilities':{'fs':{'readTextFile':False,'writeTextFile':False},'terminal':False},'clientInfo':{'name':'dsh-p0-probe','version':'1'}})
 if 'result' in r:call(2,'session/new',{'cwd':d,'mcpServers':[]})
 os.killpg(p.pid,signal.SIGTERM)
 try:p.wait(timeout=4)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
 out.append({'process_exit':p.returncode})
Path('.ai/tasks/dsh-p0-executor-probes/artifacts/codely-acp.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False))
