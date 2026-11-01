/* KARNA data-inspection & Greek strike-lab; all imported values remain UNVERIFIED. */
(function(root){'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const s=v=>String(v??'');
const sec=(a,b)=>(Date.parse(a)-Date.parse(b))/1000;
function inspect(rows,groups){
  const out={observations:rows.length,groups:groups.length,indices:{NIFTY:0,BANKNIFTY:0},first:rows[0]?.timestamp??null,last:rows.at(-1)?.timestamp??null,sourceTypes:{},expiryRows:0,expiryBlocked:0,staleGreeks:0,staleOi:0,staleBar:0,wideSpreads:0,deltaRejected:0,invalidLiquidity:0,events:0,closedBars:0,unknownFiiDii:true,unknownFuturesOi:true,brokerAuthenticated:false,pricesVerified:false,estimatedCharges:true,holidayCalendarVerified:false};
  for(const q of rows){out.indices[q.index]++;out.sourceTypes[q.source]=(out.sourceTypes[q.source]||0)+1;
    if(q.expiry===q.timestamp.slice(0,10)){out.expiryRows++;out.expiryBlocked++;}
    if(sec(q.timestamp,q.greeks_timestamp)>180)out.staleGreeks++;
    if(sec(q.timestamp,q.oi_timestamp)>300)out.staleOi++;
    if(!q.bar_closed||sec(q.timestamp,q.bar_timestamp)>120||sec(q.timestamp,q.bar_timestamp)<60)out.staleBar++;else out.closedBars++;
    if((q.ask-q.bid)/q.ask>0.02)out.wideSpreads++;
    if(!root.KARNA_CORE.deltaEligible(q))out.deltaRejected++;
    if(q.quote_qty<q.lot_size)out.invalidLiquidity++;
    if(q.high_impact_event)out.events++;
  }
  out.mandatoryIssues=out.staleGreeks+out.staleOi+out.staleBar+out.wideSpreads+out.invalidLiquidity;
  out.paperEligible=out.mandatoryIssues===0;
  out.liveEligible=false;
  return out;
}
function strikeAnalysis(quotes){
  if(!Array.isArray(quotes))throw Error('Strike list must be an array');
  return quotes.map(q=>{const deltaOk=root.KARNA_CORE.deltaEligible(q);const expiry=q.expiry===q.timestamp.slice(0,10);
    const safeTheta=expiry?false:true; // No validated expiry-day Theta model exists.
    const rank=deltaOk?root.KARNA_CORE.greekRank(q,quotes):null;
    const d=root.KARNA_CORE.decision(q,quotes);
    const estCost=q.ask*q.lot_size;
    const stop=Math.max(0.01,Math.round((q.ask-1.25*q.option_atr)*100)/100);
    const estRisk=(q.ask-stop)*q.lot_size+root.KARNA_CORE.CFG.feePerSide*2+2*root.KARNA_CORE.CFG.slippagePerUnit*q.lot_size;
    return {index:q.index,side:q.side,strike:q.strike,expiry:q.expiry,bid:q.bid,ask:q.ask,delta:q.delta,gamma:q.gamma,theta:q.theta,score:rank,signalScore:d.score,expiryBlocked:!safeTheta,deltaEligible:deltaOk,oneLotAffordable:estCost<=root.KARNA_CORE.CFG.capital,oneLotRiskOk:estRisk<=root.KARNA_CORE.CFG.riskPerTrade,fullyEligible:d.eligible&&estCost<=root.KARNA_CORE.CFG.capital&&estRisk<=root.KARNA_CORE.CFG.riskPerTrade,reasons:d.reasons,lotCost:Math.round(estCost*100)/100,estimatedPlannedRisk:Math.round(estRisk*100)/100};
  }).sort((a,b)=>{const ag=a.score??-1,bg=b.score??-1;return bg-ag||b.gamma-a.gamma;});
}
function parseImportJSON(data){
 if(Array.isArray(data))return data;
 if(data&&typeof data==='object'&&Array.isArray(data.snapshots))return data.snapshots;
 throw Error('Expected a JSON array of quote rows or an object containing snapshots[]. Trade reports are not snapshot inputs.');
}
root.KARNA_READINESS={inspect,strikeAnalysis,parseImportJSON};
if(typeof module==='object'&&module.exports)module.exports=root.KARNA_READINESS;
})(typeof window!=='undefined'?window:globalThis);
