/* KARNA v0.5 Cloud Staging Status: PUBLIC, READ ONLY, NO SECRETS.
   Never fetches private routes, sends auth headers, stores secrets or executes trades. */
(function(){'use strict';
const ENDPOINT='https://karna-paper-backend.onrender.com/api/v1/public/staging-status';
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function card(name,value){return '<div class="dataCard"><span>'+safe(name)+'</span><b>'+safe(value)+'</b></div>';}
let busy=false;
async function refresh(){
 if(busy)return;busy=true; const button=$('cloudRefresh');button.disabled=true;
 $('cloudMessage').textContent='Checking Render. Free service may take time to wake up...';
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),85000);
 try{
  const r=await fetch(ENDPOINT,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  if(d.service!=='KARNA'||d.paper_only!==true||d.broker_execution_enabled!==false) throw Error('Unexpected response or paper safety mismatch');
  $('cloudMessage').textContent='Cloud staging endpoint is reachable. No broker or market feed is connected.';
  $('cloudDetails').innerHTML=[card('Backend',d.service+' '+d.version),card('Deployment stage',d.stage),card('Data provenance',d.data_source),card('Live market connection',d.market_data_connected?'YES':'NO'),card('Broker execution',d.broker_execution_enabled?'ENABLED':'DISABLED'),card('Persistent engine',d.simulation_continuously_running?'RUNNING':'NOT RUNNING')].join('');
 }catch(err){
  $('cloudMessage').textContent='Cloud status unavailable: '+(err.name==='AbortError'?'request timed out':String(err.message||err))+'. This does not affect browser replay.';
  $('cloudDetails').textContent='';
 }finally{clearTimeout(timeout);busy=false;button.disabled=false;}
}
$('cloudRefresh').addEventListener('click',refresh);
})();
