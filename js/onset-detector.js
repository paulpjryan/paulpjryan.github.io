// Onset detector, shared by the AudioWorklet and the ScriptProcessor fallback.
export class Det {
  constructor(sr){
    this.sr=sr; this.hp=0; this.px=0; this.fast=0; this.slow=0; this.since=1e9;
    this.refract=Math.round(sr*0.08); this.floor=Math.pow(10,-42/10); this.ratio=4;
    this.a=Math.exp(-1/(0.0015*sr)); this.b=Math.exp(-1/(0.12*sr));
    this.win=0; this.acc=0; this.n=0; this.oF=0; this.measure=Math.round(0.06*sr);
    this.lvl=0; this.emax=0; this.lvlN=0; this.lvlEvery=Math.round(0.05*sr); this.out=[]; this.bl=Math.round(0.03*sr); this.buf=new Float32Array(this.bl); this.bi=0;
    // note length: full-band 3 ms envelope (its own fade time is subtracted); a strum ends 20 dB below its own peak, or when the next strum starts
    this.env=0; this.c=Math.exp(-1/(0.003*sr)); this.lag=Math.round(0.003*sr*Math.log(100)); this.track=false; this.tF=0; this.pk=0;
    this.pkWin=Math.round(0.05*sr); this.maxLen=Math.round(2*sr); this.drop=0.01;
  }
  set(o){
    if(o.trigDb!=null) this.floor=Math.pow(10,o.trigDb/10);
    if(o.refract!=null) this.refract=Math.round(this.sr*o.refract);
  }
  run(ch, frame0){
    const out=this.out; out.length=0;
    for(let i=0;i<ch.length;i++){
      const x=ch[i];
      this.hp=0.97*(this.hp+x-this.px); this.px=x;
      const e=this.hp*this.hp;
      this.fast=this.a*this.fast+(1-this.a)*e;
      const prevSlow=this.slow;
      this.slow=this.b*this.slow+(1-this.b)*e;
      this.env=this.c*this.env+(1-this.c)*x*x;
      const f=frame0+i;
      if(this.track){
        const age=f-this.tF;
        if(age<this.pkWin){ if(this.env>this.pk) this.pk=this.env; }
        else if(this.env<Math.max(this.pk*this.drop,this.floor*0.25) || age>this.maxLen){
          out.push({type:'end',frame:this.tF,end:Math.max(this.tF+1,f-this.lag),cut:false}); this.track=false;
        }
      }
      if(this.win>0){
        this.acc+=x*x; this.n++; this.win--;
        if(this.win===0) out.push({type:'hit',frame:this.oF,rms:Math.sqrt(this.acc/this.n)});
      }
      this.since++;
      this.buf[this.bi]=this.fast; this.bi=(this.bi+1)%this.bl;
      if(this.since>this.refract && this.fast>this.floor && this.fast>prevSlow*this.ratio){
        // backtrack: find the quietest point in the last 30 ms, then the first doubling after it
        const L=this.bl; let mn=Infinity, mi=0;
        for(let k=0;k<L;k++){ const v=this.buf[(this.bi+k)%L]; if(v<mn){mn=v;mi=k;} }
        let on=L-1; for(let k=mi;k<L;k++){ if(this.buf[(this.bi+k)%L]>mn*4){ on=k; break; } }
        const nf=frame0+i-(L-1-on);
        if(this.win>0 && this.n>0) out.push({type:'hit',frame:this.oF,rms:Math.sqrt(this.acc/this.n)});
        if(this.track) out.push({type:'end',frame:this.tF,end:nf,cut:true});
        this.since=0; this.oF=nf; this.win=this.measure; this.acc=0; this.n=0;
        this.track=true; this.tF=nf; this.pk=this.env;
      }
      const ax=x<0?-x:x; if(ax>this.lvl) this.lvl=ax; if(this.fast>this.emax) this.emax=this.fast;
      if(++this.lvlN>=this.lvlEvery){ out.push({type:'lvl',v:this.lvl,e:this.emax}); this.lvl=0; this.emax=0; this.lvlN=0; }
    }
    return out;
  }
}
