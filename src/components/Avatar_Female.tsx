import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimationMixer, MathUtils, SkinnedMesh } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useChat } from '../hooks/useChat';
const models:Record<string,string[]>={stylized:['model9.glb','animations_Naoki.glb'],female:['female_model.glb','female_animations_final.glb'],wawa:['model.glb','animations.glb']};
function Human({model='stylized',...props}:any){
 const paths=models[model]||models.stylized;const {scene:sourceScene}=useGLTF('/models/'+paths[0]);const {animations}=useGLTF('/models/'+paths[1]);
 // Each mounted avatar owns its skeleton and mixer. Binding to the loaded scene
 // directly avoids a null group ref or a stale cached skeleton after model changes.
 const scene=useMemo(()=>clone(sourceScene),[sourceScene]);
 const mixer=useMemo(()=>new AnimationMixer(scene),[scene]);
 const clips=useMemo(()=>animations.map(source=>{const clip=source.clone();clip.tracks=clip.tracks.filter(track=>Boolean(scene.getObjectByName(track.name.slice(0,track.name.lastIndexOf('.')))));return clip;}),[animations,scene]);
 const {speaking,analyser}=useChat();
 const spectrum=useRef(new Uint8Array(256)),blinkAt=useRef(2.5),blinkEnd=useRef(0);
 const morphs=useMemo(()=>{const meshes:SkinnedMesh[]=[];scene.traverse((child:any)=>{if(child.isSkinnedMesh&&child.morphTargetDictionary){meshes.push(child);child.frustumCulled=false;}});return meshes;},[scene]);
 useLayoutEffect(()=>{const clip=clips.find(item=>item.name===(speaking?'Talking':'Idle'))||clips[0];if(!clip)return;const action=mixer.clipAction(clip);action.reset().setEffectiveTimeScale(.85).setEffectiveWeight(1).play();mixer.update(1/60);return()=>{action.fadeOut(.2);};},[speaking,clips,mixer]);
 useEffect(()=>()=>{mixer.stopAllAction();mixer.uncacheRoot(scene);},[mixer,scene]);
 useFrame(({clock},delta)=>{mixer.update(delta);let energy=0,brightness=0;if(speaking&&analyser.current){analyser.current.getByteFrequencyData(spectrum.current);for(let i=3;i<45;i++)energy+=spectrum.current[i];for(let i=45;i<100;i++)brightness+=spectrum.current[i];energy=Math.min(1,Math.max(0,energy/42/130-.04));brightness=Math.min(1,brightness/55/100);}const now=clock.elapsedTime;if(now>blinkAt.current){blinkEnd.current=now+.13;blinkAt.current=now+2.5+Math.random()*3;}const blink=now<blinkEnd.current?1:0;const values:Record<string,number>={viseme_aa:energy*.7,viseme_AA:energy*.7,viseme_O:energy*(1-brightness)*.28,viseme_I:energy*brightness*.35,mouthSmile:.08,mouthSmileLeft:.08,mouthSmileRight:.08,'eye closed.L':blink,'eye closed.R':blink,eyeBlinkLeft:blink,eyeBlinkRight:blink};for(const mesh of morphs)for(const[name,value]of Object.entries(values)){const index=mesh.morphTargetDictionary![name];if(index!==undefined&&mesh.morphTargetInfluences)mesh.morphTargetInfluences[index]=MathUtils.damp(mesh.morphTargetInfluences[index],value,name.startsWith('eye')?30:18,delta);}});
 return <group {...props}><primitive object={scene}/></group>;
}
function Shiba(){const{nodes,materials}=useGLTF('/models/shiba.glb')as any;return <group scale={.5} position={[0,1,0]}>{['Box002_default_0','Group18985_default_0','Object001_default_0'].map(name=><mesh key={name} geometry={nodes[name].geometry} material={materials.default} rotation={[-Math.PI/2,0,0]}/>)}</group>;}
export function Avatar({model='stylized',...props}:any){return model==='shiba'?<Shiba/>:<Human key={model} model={model} {...props}/>;}
useGLTF.preload('/models/model9.glb');useGLTF.preload('/models/animations_Naoki.glb');
