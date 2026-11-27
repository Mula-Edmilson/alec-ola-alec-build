// AudioWorklet uses an integer-ratio box downsampler from 48 kHz to 16 kHz.
// 80 ms PCM16 little-endian frames; the output of this node is silent.
class Capture extends AudioWorkletProcessor{
 constructor(){super();this.ratio=sampleRate/16000;this.sum=0;this.n=0;this.i=0;this.frame=new ArrayBuffer(2560);this.view=new DataView(this.frame);}
 process(inputs){const mono=inputs[0]?.[0];if(!mono)return true;
  for(const v of mono){this.sum+=v;if(++this.n===this.ratio){const s=Math.max(-1,Math.min(1,this.sum/this.ratio));this.view.setInt16(this.i*2,Math.round(s*(s<0?32768:32767)),true);this.sum=0;this.n=0;
   if(++this.i===1280){this.port.postMessage(this.frame,[this.frame]);this.frame=new ArrayBuffer(2560);this.view=new DataView(this.frame);this.i=0;}
  }}return true;
 }
}
registerProcessor('alec-capture',Capture);
