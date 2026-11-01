/* KARNA Browser Paper Engine — standalone simulator, NO network or broker-order code.
   Adapted from KARNA v0.2 Python rules. All sample fees, stops, Greeks and fills are illustrative.
   This is NOT an authenticated data source, validated backtest or investment recommendation. */
(function(root){
'use strict';
const CFG = Object.freeze({capital:10000,riskPerTrade:500,dailyLossLimit:500,target:1000,preferredPremium:80,maxOiAge:300,maxGreekAge:180,feePerSide:23,slippagePerUnit:0.05,forceFlat:'15:20',minScore:6});
const required = ['timestamp','index','side','strike','expiry','lot_size','bid','ask','delta','gamma','option_atr','adx','di_plus','di_minus','cpr_top','cpr_bottom','close','ema20','ema9_5m','vwap','prev_high','prev_low','candle_open','volume_ratio','oi_pressure','pcr_change','oi_timestamp','greeks_timestamp','bar_timestamp','bar_closed','major_reversal','source','quote_qty','high_impact_event'];
const numerical = ['strike','lot_size','bid','ask','delta','gamma','option_atr','adx','di_plus','di_minus','cpr_top','cpr_bottom','close','ema20','ema9_5m','vwap','prev_high','prev_low','candle_open','volume_ratio','oi_pressure','pcr_change','quote_qty'];
const HOLIDAYS_2026 = new Set(['2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25']); // Legacy fixture calendar, not exchange-verified.
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
const bool=v=>['1','true','yes'].includes(String(v).trim().toLowerCase()) ? true : ['0','false','no'].includes(String(v).trim().toLowerCase()) ? false : null;
const stamp=v=>{const t=Date.parse(v);if(!Number.isFinite(t)||!/[+-]\d{2}:\d{2}$/.test(String(v))) throw Error('Timestamp must include timezone offset');return t};
const key=q=>[q.index,q.side,q.strike,q.expiry].join('|');
const dayString=q=>q.timestamp.slice(0,10);
const secs=(a,b)=>(stamp(a)-stamp(b))/1000;
function parseRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error('No data rows loaded');
  if(rows.length>25000)throw Error('Maximum 25,000 snapshots per browser import');
  return rows.map((raw,i)=>{
    for(const k of required){if(!(k in raw))throw Error('Row '+(i+1)+' missing '+k)}
    let q={...raw};
    for(const k of numerical){q[k]=Number(raw[k]);if(!Number.isFinite(q[k]))throw Error('Row '+(i+1)+' invalid '+k)}
    q.theta=raw.theta==null||String(raw.theta).trim()===''?null:Number(raw.theta);
    if(q.theta!==null&&!Number.isFinite(q.theta))throw Error('Row '+(i+1)+' invalid theta');
    for(const k of ['bar_closed','major_reversal','high_impact_event']){q[k]=bool(raw[k]);if(q[k]===null)throw Error('Row '+(i+1)+' invalid '+k)}
    for(const f of ['timestamp','oi_timestamp','greeks_timestamp','bar_timestamp'])stamp(q[f]);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(q.expiry)||!Number.isFinite(Date.parse(q.expiry+'T00:00:00Z')))throw Error('Invalid expiry');
    if(!['NIFTY','BANKNIFTY'].includes(q.index)||!['CE','PE'].includes(q.side))throw Error('Only NIFTY or BANKNIFTY CE/PE permitted');
    if(q.lot_size<=0||!Number.isInteger(q.lot_size)||q.quote_qty<0||q.bid<=0||q.ask<q.bid||q.option_atr<=0||q.gamma<=0||q.strike<=0)throw Error('Invalid price, gamma, lot or strike');
    if(q.expiry<dayString(q))throw Error('Expired contract');
    if(['oi_timestamp','greeks_timestamp','bar_timestamp'].some(f=>secs(q.timestamp,q[f])<0))throw Error('Source timestamps later than quote');
    if(!['DEMO','IMPORTED'].includes(q.source))throw Error('Untrusted source label');
    return q;
  }).sort((a,b)=>stamp(a.timestamp)-stamp(b.timestamp)||a.index.localeCompare(b.index)||a.strike-b.strike);
}
function groupRows(rows){const map=new Map();for(const q of rows){if(!map.has(q.timestamp))map.set(q.timestamp,[]);map.get(q.timestamp).push(q)}return Array.from(map,([time,quotes])=>({time,quotes}));}
function deltaEligible(q){return q.side==='CE' ? q.delta>0.20&&q.delta<0.80 : q.delta> -0.80&&q.delta< -0.20;}
function greekRank(q,peers){const max=Math.max(q.gamma,...peers.filter(p=>p.index===q.index&&p.side===q.side&&p.expiry===q.expiry&&deltaEligible(p)).map(p=>p.gamma));const centrality=Math.max(0,1-Math.abs(Math.abs(q.delta)-0.5)/0.3);return round2((0.3*centrality+0.7*q.gamma/max)*1000)/1000;}
function tradingTime(q){const d=dayString(q); const weekday=new Date(d+'T12:00:00Z').getUTCDay();const t=q.timestamp.slice(11,16);return d.startsWith('2026-')&&weekday!==0&&weekday!==6&&!HOLIDAYS_2026.has(d)&&((t>='09:30'&&t<'11:30')||(t>='13:30'&&t<'15:20'));}
function decision(q,peers){let reasons=[];
 if(!tradingTime(q))reasons.push('Outside permitted demo trading window/date');
 if(!deltaEligible(q))reasons.push('Signed Delta out of bounds');
 if(secs(q.timestamp,q.greeks_timestamp)>CFG.maxGreekAge)reasons.push('Greek snapshot stale');
 if(secs(q.timestamp,q.oi_timestamp)>CFG.maxOiAge)reasons.push('OI snapshot stale');
 const barAge=secs(q.timestamp,q.bar_timestamp);
 if(!q.bar_closed||barAge>120||barAge<60)reasons.push('Closed 1m candle unavailable or stale');
 if(q.high_impact_event)reasons.push('High-impact event pause');
 if(q.expiry===dayString(q))reasons.push(q.theta==null?'Expiry Theta missing':'Expiry Theta model unvalidated; no expiry trades');
 const up=q.close>Math.max(q.ema20,q.ema9_5m,q.vwap,q.cpr_top,q.prev_high,q.candle_open);
 const down=q.close<Math.min(q.ema20,q.ema9_5m,q.vwap,q.cpr_bottom,q.prev_low,q.candle_open);
 const direction=q.side==='CE'?up:down,di=q.side==='CE'?q.di_plus>q.di_minus:q.di_minus>q.di_plus;
 if(!direction)reasons.push('Breakout/EMA/VWAP/CPR direction failed');if(!di)reasons.push('DI direction failed');
 if(q.adx<18)reasons.push('ADX too weak');if(q.volume_ratio<1)reasons.push('Volume too low');
 if(q.side==='CE'?q.oi_pressure<=0:q.oi_pressure>=0)reasons.push('OI proxy pressure disagreement');
 if((q.ask-q.bid)/q.ask>0.02)reasons.push('Bid/ask spread >2%');
 if(q.quote_qty<q.lot_size)reasons.push('Insufficient available quote quantity');
 const score=(direction?2:0)+(di?1:0)+(q.adx>=22?1:0)+(q.adx>=26?1:0)+(q.volume_ratio>=1.2?1:0)+(q.volume_ratio>=1.6?1:0)+((q.side==='CE'?q.oi_pressure>0.005:q.oi_pressure< -0.005)?1:0);
 if(score<CFG.minScore)reasons.push('Weighted signal score below minimum');
 return {eligible:reasons.length===0,score,greekScore:deltaEligible(q)?greekRank(q,peers):0,reasons};
}
function costs(qty){return CFG.feePerSide*2+2*CFG.slippagePerUnit*qty;}
function facts(q,d){const f=['index','side','strike','expiry','timestamp','delta','gamma','theta','adx','di_plus','di_minus','cpr_top','cpr_bottom','ema20','ema9_5m','vwap','close','volume_ratio','oi_pressure','pcr_change','bid','ask','option_atr','source'];return Object.assign(Object.fromEntries(f.map(k=>[k,q[k]])),{setupScore:d.score,greekScore:d.greekScore,note:'Snapshot values are synthetic/imported, not authenticated. OI proxy is not complete futures/option-chain data.'});}
class PaperEngine{
 constructor(){this.sessionId='demo-'+Math.random().toString(36).slice(2,10);this.pending=null;this.position=null;this.realized=0;this.lossUsed=0;this.locked=false;this.approvalRequired=false;this.day=null;this.last=null;this.events=[];this.trades=[];this.disarmed=new Set();this.groupsProcessed=0;}
 log(ts,kind,message,extra={}){const e={sessionId:this.sessionId,seq:this.events.length+1,at:ts,kind,message,...extra};this.events.push(e);return e;}
 approve(){if(!this.approvalRequired)return false;this.approvalRequired=false;this.log(this.last,'AUTHORIZATION','Manual next-session approval');return true;}
 newSession(time){const d=time.slice(0,10);if(this.day===null){this.day=d;return}if(d!==this.day){if(this.pending||this.position){this.locked=true;this.log(time,'DATA_ERROR','Unverified prior day position: block entries');return}const wasLocked=this.locked;this.day=d;this.lossUsed=0;this.locked=false;this.approvalRequired=wasLocked;this.disarmed.clear();this.log(time,'SESSION','New day, verify risk and authorization');}}
 size(q){const stop=Math.max(0.01,round2(q.ask-1.25*q.option_atr));const cap=Math.min(CFG.riskPerTrade,Math.max(0,CFG.dailyLossLimit-this.lossUsed));let lots=0,risk=0;const cash=CFG.capital+Math.min(0,this.realized);for(let n=1;n<=100;n++){const qty=n*q.lot_size;const est=qty*(q.ask-stop)+costs(qty);if(est<=cap&&qty<=q.quote_qty&&q.ask*qty<=cash){lots=n;risk=est}else break}return {qty:lots*q.lot_size,stop,risk:round2(risk)};}
 close(q,reason){const p=this.position;const exit=Math.max(0.01,round2(q.bid-CFG.slippagePerUnit));const gross=round2((exit-p.entry)*p.qty),net=round2(gross-costs(p.qty));this.realized=round2(this.realized+net);this.lossUsed=round2(this.lossUsed+Math.max(0,-net));if(this.lossUsed>=CFG.dailyLossLimit||CFG.capital+this.realized<=0)this.locked=true;
 const t={index:p.contract.index,side:p.contract.side,strike:p.contract.strike,expiry:p.contract.expiry,entryTime:p.time,exitTime:q.timestamp,entry:p.entry,exit,qty:p.qty,gross,net,reason,entryFacts:p.entryFacts,initialStop:p.initialStop,finalStop:p.stop,trailing:p.trails};this.trades.push(t);this.log(q.timestamp,'PAPER_CLOSE',reason,{net,exit,finalStop:p.stop});this.position=null;}
 update(q){const p=this.position;p.highBid=Math.max(p.highBid,q.bid);const strong=q.adx>=27&&(p.contract.side==='CE'?q.di_plus>q.di_minus:q.di_minus>q.di_plus);const mult=strong?1.6:0.9;let trail=p.highBid-mult*q.option_atr;const entryRisk=(p.entry-p.initialStop)*p.qty,openProfit=(q.bid-p.entry)*p.qty;
 if(openProfit>=entryRisk)trail=Math.max(trail,p.entry+costs(p.qty)/p.qty);
 if(openProfit>=2*entryRisk)trail=Math.max(trail,p.entry+0.6*openProfit/p.qty);
 const was=p.stop;p.stop=round2(Math.max(p.stop,p.initialStop,trail));
 if(p.stop>was){const detail={at:q.timestamp,from:was,to:p.stop,bid:q.bid,highBid:p.highBid,atr:q.option_atr,mult,adx:q.adx,strong,openGrossPnl:round2(openProfit)};p.trails.push(detail);this.log(q.timestamp,'TRAIL_UPDATE','Illustrative trailing stop tightened',detail)}
 if(q.major_reversal)this.close(q,'Confirmed reversal indicator');else if(q.timestamp.slice(11,16)>=CFG.forceFlat)this.close(q,'Intraday cutoff');else if(q.bid<=p.stop)this.close(q,'Paper trailing/protective stop crossed');else if((p.entry-q.bid)*p.qty+costs(p.qty)>=CFG.dailyLossLimit-this.lossUsed)this.close(q,'Simulated daily loss emergency');
 }
 step(group){const {time,quotes}=group;if(this.last&&stamp(time)<=stamp(this.last))throw Error('Non-monotonic replay timestamps');this.last=time;this.groupsProcessed++;this.newSession(time);
 const by=new Map(quotes.map(q=>[key(q),q]));
 if(this.position){const q=by.get(key(this.position.contract));if(q)this.update(q);else this.log(time,'DATA_GAP','Position quote missing; block new entries');return;}
 if(this.pending){const p=this.pending,q=by.get(key(p.contract));const timeout=p.limit<50?60:120;
 if(q&&q.ask<=p.limit&&q.quote_qty>=p.qty){const risk=p.qty*(q.ask-p.initialStop)+costs(p.qty);if(risk>Math.min(CFG.riskPerTrade,CFG.dailyLossLimit-this.lossUsed)){this.log(time,'ORDER_REJECTED','Simulated fill risk exceeded');this.pending=null;}else{this.position={contract:p.contract,time,entry:q.ask,qty:p.qty,initialStop:p.initialStop,stop:p.initialStop,highBid:q.bid,entryFacts:p.entryFacts,trails:[]};this.pending=null;this.log(time,'PAPER_FILL','Paper order filled against next observed ask',{price:q.ask,qty:p.qty,risk:round2(risk)});}}
 else if(secs(time,p.time)>=timeout){this.log(time,'PAPER_CANCEL','Pending limit order expired without fill');this.pending=null;}return;
 }
 if(this.locked||this.approvalRequired||!tradingTime({...quotes[0],timestamp:time}))return;
 for(const q of quotes){const id=q.index+'|'+q.side;if(this.disarmed.has(id)&&((q.side==='CE'&&q.close<q.ema20)||(q.side==='PE'&&q.close>q.ema20))){this.disarmed.delete(id);this.log(time,'RESET','New signal rearmed',{index:q.index,side:q.side});}}
 // Determine market direction from the weighted signal model; choose strikes within each
 // index+direction STRICTLY by the Delta/Gamma ranking. Risk and capital remain vetoes.
 const valid=quotes.map(q=>({q,d:decision(q,quotes)})).filter(x=>x.d.eligible);
 const buckets=new Map();
 for(const x of valid){const groupKey=x.q.index+'|'+x.q.side;if(!buckets.has(groupKey))buckets.set(groupKey,[]);buckets.get(groupKey).push(x);}
 const choices=Array.from(buckets,([groupKey,items])=>({groupKey,signalScore:Math.max(...items.map(x=>x.d.score)),items:items.sort((a,b)=>b.d.greekScore-a.d.greekScore)}));
 choices.sort((a,b)=>b.signalScore-a.signalScore||b.items[0].d.greekScore-a.items[0].d.greekScore);
 for(const group of choices){for(const {q,d} of group.items){
  if(this.disarmed.has(q.index+'|'+q.side))continue;
  const z=this.size(q);if(!z.qty){this.log(time,'RISK_REJECTED','Greek-ranked strike rejected: whole lot exceeds remaining risk or capital',{index:q.index,side:q.side,strike:q.strike,greekScore:d.greekScore});continue;}
  const c={index:q.index,side:q.side,strike:q.strike,expiry:q.expiry};this.pending={contract:c,time,limit:q.ask,qty:z.qty,initialStop:z.stop,entryFacts:facts(q,d)};this.disarmed.add(q.index+'|'+q.side);this.log(time,'PAPER_LIMIT_CREATED','Pending BUY limit; no real order',{index:q.index,side:q.side,strike:q.strike,qty:z.qty,limit:q.ask,stop:z.stop,plannedRisk:z.risk,signal:this.pending.entryFacts});return;
 }}
 }
 snapshot(){return {mode:'SYNTHETIC_OR_IMPORTED_PAPER_ONLY',sessionId:this.sessionId,capital:CFG.capital,balance:round2(CFG.capital+this.realized),realizedPnl:round2(this.realized),lossUsed:this.lossUsed,lossRemaining:round2(Math.max(0,CFG.dailyLossLimit-this.lossUsed)),locked:this.locked,approvalRequired:this.approvalRequired,position:this.position?{...this.position,entryFacts:undefined,trails:undefined}:null,pending:this.pending?{...this.pending,entryFacts:undefined}:null,groupsProcessed:this.groupsProcessed,completedTrades:this.trades.length,events:this.events.length};}
}
function parseCSV(text){const out=[],lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw Error('CSV requires header and data');const split=s=>{let a=[],v='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){a.push(v);v=''}else v+=c;}a.push(v);if(quoted)throw Error('Unclosed quoted CSV field');return a};const keys=split(lines[0]);for(let i=1;i<lines.length;i++){const vals=split(lines[i]);if(vals.length!==keys.length)throw Error('CSV row '+(i+1)+' does not match header');out.push(Object.fromEntries(keys.map((k,j)=>[k.trim(),vals[j]])))}return out;}
root.KARNA_CORE={CFG,parseRows,groupRows,deltaEligible,greekRank,decision,PaperEngine,parseCSV};
if(typeof module==='object'&&module.exports)module.exports=root.KARNA_CORE;
})(typeof window!=='undefined'?window:globalThis);
