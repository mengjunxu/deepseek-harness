import subprocess,tempfile,os,json,threading,time,signal
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
artifact=Path.cwd()/'.ai/tasks/dsh-p0-executor-probes/artifacts'
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
  self.server.seen.append({'path':self.path,'stream':body.get('stream'),'model':body.get('model')})
  self.server.received.set()
  if self.server.mode=='hang':
   self.server.stop.wait(20);return
  if self.server.mode=='unauthorized':
   self.send_response(401);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":{"message":"P0 mock authentication rejected","type":"authentication_error"}}');return
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for delta,finish in [({'role':'assistant','content':'DSH_P0_OK'},None),({},'stop')]:
   data={'id':'p0','object':'chat.completion.chunk','created':1,'model':'p0-mock','choices':[{'index':0,'delta':delta,'finish_reason':finish}]}
   self.wfile.write(('data: '+json.dumps(data)+'\n\n').encode());self.wfile.flush()
  self.wfile.write(b'data: [DONE]\n\n')
results=[]
for mode in ['success','unauthorized','hang']:
 with tempfile.TemporaryDirectory(prefix='dsh-p0-codely-') as d:
  home=Path(d)/'home';work=Path(d)/'workspace';home.mkdir();work.mkdir()
  env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','TMPDIR','SYSTEMROOT']}
  env.update(CUSTOM_AUTH='1',HOME=str(home),CODELY_HOME=str(home/'codely'),OPENAI_API_KEY='p0-fake-local-only',NO_PROXY='127.0.0.1,localhost')
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True;server.mode=mode;server.seen=[];server.received=threading.Event();server.stop=threading.Event()
  threading.Thread(target=server.serve_forever,daemon=True).start()
  argv=['codely','--no-upm','--no-telemetry','--no-agents','--no-auto-edit-memory','--auth-type','openai','--openai-base-url',f'http://127.0.0.1:{server.server_port}/v1','--wire-api','chat','--model','p0-mock','--approval-mode','plan','--path-policy','strict','--output-format','stream-json','--prompt','Reply exactly DSH_P0_OK. Do not call tools.']
  p=subprocess.Popen(argv,cwd=work,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
  started=time.monotonic();timeout=False;cancel=False
  try:
   if mode=='hang':
    if server.received.wait(15):cancel=True;os.killpg(p.pid,signal.SIGTERM)
   out,err=p.communicate(timeout=25)
  except subprocess.TimeoutExpired:
   timeout=True;os.killpg(p.pid,signal.SIGTERM)
   try:out,err=p.communicate(timeout=4)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);out,err=p.communicate()
  server.stop.set();server.shutdown();server.server_close()
  events=[]
  for line in out.splitlines():
   try:events.append(json.loads(line))
   except json.JSONDecodeError:pass
  # Only loopback model data is emitted; no native account environment or settings loaded.
  record={'mode':mode,'exit_code':p.returncode,'timeout':timeout,'cancel_sent':cancel,'duration_seconds':round(time.monotonic()-started,2),'requests':server.seen,'events':events,'stderr_tail':err[-1200:]}
  results.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
(artifact/'codely-probe.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
