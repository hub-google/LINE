import {readFile,copyFile,stat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

/* Keep the full 45s film; only normalize its encoding/container when needed.
   H.264 + yuv420p + optional AAC in an MP4 with faststart gives the widest
   practical support on iOS Safari, Android Chrome and desktop browsers. */
function probe(filename){
 let text;
 try{
  text=execFileSync("ffprobe",[
   "-v","error","-show_format","-show_streams","-of","json",filename
  ],{encoding:"utf8",maxBuffer:2*1024*1024,timeout:30000});
 }catch(error){
  throw Error("Cannot inspect intro movie with ffprobe: "+error.message);
 }
 const data=JSON.parse(text);
 const video=data.streams?.find(item=>item.codec_type==="video");
 const audio=data.streams?.find(item=>item.codec_type==="audio")||null;
 if(!video||!Number.isFinite(Number(data.format?.duration)))
  throw Error("Intro movie must have a readable video track and duration");
 return {video,audio,duration:Number(data.format.duration),format:data.format};
}
function fastStart(bytes){
 let offset=0,moov=-1,mdat=-1;
 // MP4 box boundaries: ISO BMFF supports 32-bit and 64-bit atom sizes.
 while(offset+8<=bytes.length){
  let size=bytes.readUInt32BE(offset);
  const type=bytes.toString("ascii",offset+4,offset+8);
  let header=8;
  if(size===1){
   if(offset+16>bytes.length)return false;
   const extended=bytes.readBigUInt64BE(offset+8);
   if(extended>BigInt(Number.MAX_SAFE_INTEGER))return false;
   size=Number(extended);header=16;
  }else if(size===0)size=bytes.length-offset;
  if(size<header||offset+size>bytes.length)return false;
  if(type==="moov")moov=offset;
  if(type==="mdat"&&mdat===-1)mdat=offset;
  offset+=size;
 }
 return moov>=0&&mdat>=0&&moov<mdat;
}
function compatible(probeResult,bytes){
 const {video,audio}=probeResult;
 const fpsText=String(video.avg_frame_rate||"30/1").split("/");
 const fps=Number(fpsText[0])/Number(fpsText[1]||1);
 return video.codec_name==="h264" &&
  video.pix_fmt==="yuv420p" &&
  Number(video.level||0)<=42 &&
  Number(video.width)>0 && Number(video.height)>0 &&
  Number(video.width)<=1920 && Number(video.height)<=1920 &&
  (video.sample_aspect_ratio==null||video.sample_aspect_ratio==="1:1") &&
  Number.isFinite(fps)&&fps>0&&fps<=30.1 &&
  (!audio||audio.codec_name==="aac") &&
  fastStart(bytes);
}
export async function prepareIntroVideo(source,dest){
 const before=await stat(source);
 if(!before.isFile()||before.size===0||before.size>25*1024*1024)
  throw Error("Brand intro source must be a nonempty MP4 under 25 MiB");
 const sourceBytes=await readFile(source);
 if(sourceBytes.toString("ascii",4,8)!=="ftyp")
  throw Error("Brand intro must be an MP4 container");
 const initial=probe(source);
 if(initial.duration<3||initial.duration>120)
  throw Error("Brand intro duration is invalid: "+initial.duration+"s");
 const normalized=!compatible(initial,sourceBytes);
 if(normalized){
  try{
   execFileSync("ffmpeg",[
    "-hide_banner","-nostdin","-loglevel","error","-y",
    "-i",source,"-map","0:v:0","-map","0:a:0?",
    "-vf","scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30,format=yuv420p",
    "-c:v","libx264","-profile:v","high","-level:v","4.2",
    "-crf","24","-preset","veryfast","-maxrate","4M","-bufsize","8M",
    "-c:a","aac","-b:a","128k","-ac","2",
    "-movflags","+faststart","-threads","2",dest
   ],{stdio:["ignore","pipe","pipe"],timeout:240000,maxBuffer:1024*1024});
  }catch(error){
   throw Error("Failed to normalize intro MP4 for mobile: "+(error.stderr?.toString()||error.message));
  }
 }else{
  await copyFile(source,dest);
 }
 const finalBytes=await readFile(dest);
 const final=probe(dest);
 if(!compatible(final,finalBytes))
  throw Error("The published intro movie does not meet H.264/AAC/yuv420p/faststart requirements");
 if(finalBytes.length>25*1024*1024)
  throw Error("Published intro exceeds the 25 MiB transfer limit");
 const info={
  file:"intro.mp4",
  format:"MP4",
  videoCodec:"H.264/AVC",
  pixelFormat:final.video.pix_fmt,
  audioCodec:final.audio?"AAC":"none",
  width:Number(final.video.width),
  height:Number(final.video.height),
  aspectRatio:Number(final.video.width)>Number(final.video.height)?"landscape":
   Number(final.video.width)<Number(final.video.height)?"portrait":"square",
  durationSeconds:Math.round(final.duration*100)/100,
  sizeBytes:finalBytes.length,
  fastStart:true,
  normalized,
  sha256:createHash("sha256").update(finalBytes).digest("hex")
 };
 console.log("Queue Monster intro video verified:",JSON.stringify(info));
 return info;
}
