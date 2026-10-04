// This measures player playback, not whether someone paid attention.
export function createRecord(){return {opens:0,plays:0,pauses:0,forward:0,backward:0,largeForward:0,ends:0,duration:0,ranges:[],events:[]}}
export function log(record,type,data={},at=Date.now()){record.events.push({type,at,...data});record.events=record.events.slice(-200);record.updatedAt=at;}
export function coverage(record){return Math.min(record.duration||Infinity,(record.ranges||[]).reduce((n,[a,b])=>n+Math.max(0,b-a),0))}
export function watchedPercent(record){return record.duration>0?Math.min(100,Math.floor(coverage(record)/record.duration*100)):0}
export function watchedEnough(record){return record.duration>0&&coverage(record)/record.duration>=.9}
function addRange(record,a,b){if(b<=a)return;const ranges=[...record.ranges,[Math.max(0,a),Math.min(record.duration||b,b)]].sort((x,y)=>x[0]-y[0]);const merged=[];for(const r of ranges){const tail=merged.at(-1);if(tail&&r[0]<=tail[1]+.1)tail[1]=Math.max(tail[1],r[1]);else merged.push(r)}record.ranges=merged;}
export class PlaybackTracker{
 constructor(record){this.record=record;this.last=null;this.state=null;this.hasPlayed=false;}
 sample({time,duration,state,rate=1,wall=performance.now(),at=Date.now()}){
  if(!Number.isFinite(time)||time<0)return;
  if(Number.isFinite(duration)&&duration>0)this.record.duration=duration;
  const last=this.last;let changed=false;
  if(last){const elapsed=(wall-last.wall)/1000,delta=time-last.time;
   // Ignore gaps after sleep/background throttling; do not invent playback or seeks.
   if(elapsed>=0&&elapsed<=3){
    const expected=last.state===1?elapsed*last.rate:0;
    if(delta>0&&delta-expected>=3){const large=delta>=30||(this.record.duration>0&&delta>=this.record.duration*.2);this.record.forward++;if(large)this.record.largeForward++;log(this.record,'forward',{from:last.time,to:time,seconds:delta,large,nearEnd:this.record.duration>0&&time>=this.record.duration*.95},at);changed=true;}
    else if(delta<=-3){this.record.backward++;log(this.record,'backward',{from:last.time,to:time,seconds:-delta},at);changed=true;}
    else if(last.state===1&&delta>0&&delta<=expected+1.5)addRange(this.record,last.time,time);
   }
  }
  if(state!==this.state){
   if(state===1){const firstPlay=!this.hasPlayed;this.hasPlayed=true;if(firstPlay||this.state!==3){this.record.plays++;log(this.record,'play',{position:time},at);changed=true;}}
   else if(state===2&&this.hasPlayed){this.record.pauses++;log(this.record,'pause',{position:time},at);changed=true;}
   else if(state===0&&this.hasPlayed){this.record.ends++;log(this.record,'end',{position:time,percent:watchedPercent(this.record),watched:watchedEnough(this.record)},at);changed=true;}
  }
  this.state=state;this.last={time,wall,state,rate:Number.isFinite(rate)&&rate>0?rate:1};return changed;
 }
 resetSample(){this.last=null;}
}
