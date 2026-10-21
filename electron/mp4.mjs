// Validate the encoder's container without rejecting valid small/low-detail clips.
export function isValidMp4(bytes) {
  if(!ArrayBuffer.isView(bytes)||bytes.byteLength<24)return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),found=new Set();
  let offset=0;
  while(offset<view.byteLength){
    if(offset+8>view.byteLength)return false;
    let size=view.getUint32(offset),header=8;
    const type=String.fromCharCode(...new Uint8Array(bytes.buffer,bytes.byteOffset+offset+4,4));
    if(size===1){if(offset+16>view.byteLength)return false;const large=view.getBigUint64(offset+8);if(large>BigInt(Number.MAX_SAFE_INTEGER))return false;size=Number(large);header=16;}
    if(size===0)size=view.byteLength-offset;
    if(size<header||offset+size>view.byteLength)return false;
    if(type!=='mdat'||size>header)found.add(type);
    offset+=size;
  }
  return found.has('ftyp')&&found.has('moov')&&found.has('mdat');
}
