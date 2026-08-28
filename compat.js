(function(){
  if(!window.pako || !window.TransformStream) return;
  class PakoDecompressionStream {
    constructor(format){
      if(format!=='gzip') throw new TypeError('Only gzip is supported');
      const chunks=[];
      const ts=new TransformStream({
        transform(chunk){ chunks.push(new Uint8Array(chunk)); },
        flush(controller){
          let size=0; for(const c of chunks) size+=c.length;
          const merged=new Uint8Array(size); let off=0;
          for(const c of chunks){ merged.set(c,off); off+=c.length; }
          controller.enqueue(window.pako.ungzip(merged));
        }
      });
      this.readable=ts.readable;
      this.writable=ts.writable;
    }
  }
  try { window.DecompressionStream=PakoDecompressionStream; } catch(e) {}
})();