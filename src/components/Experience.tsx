import { ContactShadows, CameraControls, Float } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { Avatar } from './Avatar_Female';
const cameras:Record<string,{position:[number,number,number];target:[number,number,number]}>={default:{position:[0,1.2,2.5],target:[0,1.2,0]},zoomed:{position:[0,1.7,1.2],target:[0,1.7,0]},zoomout:{position:[0,1.2,3.5],target:[0,1.2,0]}};
export function Experience({selectedModel='stylized',cameraState='default'}:{selectedModel?:string;cameraState?:string}){
 const controls=useRef<CameraControls>(null);
 useEffect(()=>{const state=cameras[cameraState]||cameras.default;controls.current?.setLookAt(...state.position,...state.target,true);},[cameraState]);
 return <><CameraControls ref={controls} minDistance={1} maxDistance={5} dollySpeed={0} truckSpeed={0} maxPolarAngle={Math.PI/2} minPolarAngle={Math.PI/2} smoothTime={.8}/>
 <ambientLight intensity={.85}/><hemisphereLight args={['#fff3e9','#69728a',1.1]}/><directionalLight position={[3,4,5]} intensity={1.45}/><directionalLight position={[-3,3,-2]} intensity={1.1} color="#d5baff"/>
 <Float speed={1.5} floatIntensity={.1} rotationIntensity={.1}><group scale={1.2}><Avatar model={selectedModel}/></group></Float><ContactShadows position={[0,0,0]} opacity={.45} scale={5} blur={2.5} far={1} resolution={128} frames={1}/></>;
}
