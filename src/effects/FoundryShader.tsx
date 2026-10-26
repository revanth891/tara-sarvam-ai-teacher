import { useEffect, useRef } from "react";

// Adapted from Revanth's DRKZEN portfolio, FoundryPortalParticles.js and
// FoundryPortalGrade.js: the turn/orbit equations, spectral palette and diagonal
// tint are retained. A transparent edge field replaces the 64,000-particle pass
// so the existing Spline scene and avatar remain the main visual.
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}
`;

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
const float TAU=6.28318530718;
mat2 turn(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
vec3 orbit(float phase,float strand,float width){
  float angle=phase*TAU+uTime*(.105+strand*.018)*(mod(strand,2.)<.5?1.:-1.);
  float radius=.49+(width-.5)*.036;
  vec3 p=vec3(cos(angle)*radius,sin(angle)*radius*.61,sin(angle)*radius*.56);
  p.xy=turn((strand-1.)*.72)*p.xy;
  p.xz=turn((strand-1.)*.36)*p.xz;
  p+=vec3(0.,sin(angle*3.+uTime*.3+strand)*.012,cos(angle*2.+strand)*.014);
  return p;
}
void main(){
  vec2 uv=vUv;
  vec2 p=(uv-.5)*vec2(uAspect,1.);
  vec3 cyan=vec3(.4392,.9020,.9608);
  vec3 lavender=vec3(.7020,.6275,.9843);
  vec3 rose=vec3(.9294,.6863,.8431);
  vec3 color=vec3(0.);
  float density=0.;
  for(int i=0;i<3;i++){
    float strand=float(i);
    vec3 flow=orbit(.12+strand*.31,strand,.6);
    vec2 q=turn(strand*.64+uTime*.12)*p;
    float wave=sin(q.y*5.5+uTime*.65+strand*2.)*.105;
    float lane=abs(q.x+wave-flow.x*.36);
    float ribbon=exp(-lane*lane*14.)*(.68+.32*sin(q.y*3.+uTime*.55+strand));
    vec3 tint=mix(cyan,lavender,clamp(uv.x*.55+uv.y*.45,0.,1.));
    tint=mix(tint,rose,strand*.22);
    color+=tint*ribbon;
    density+=ribbon;
  }
  // Keep the central robot clear; visible moving color wraps the perimeter.
  float edgeDistance=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
  float edge=1.-smoothstep(.035,.48,edgeDistance);
  float alpha=clamp(.12+density*.32,0.,.62)*edge;
  vec3 tint=color/max(density,.001);
  gl_FragColor=vec4(tint*alpha,alpha);
}
`;

export function FoundryShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const time = gl.getUniformLocation(program, "uTime");
    const aspect = gl.getUniformLocation(program, "uAspect");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    let lost = false;

    const draw = () => {
      if (lost || document.hidden) return;
      gl.uniform1f(time, reduced.matches ? 0 : elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      // DPR never exceeds 1; also bound fill-rate on large desktop displays.
      const scale = Math.min(1, window.devicePixelRatio || 1, Math.sqrt(480000 / (width * height)));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(aspect, width / height);
      draw();
    };
    const animate = (now: number) => {
      if (lost || document.hidden || reduced.matches) return;
      if (now - previous >= 1000 / 30) {
        elapsed += Math.min((now - previous) / 1000, .1);
        previous = now;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      previous = performance.now();
      draw();
      if (!document.hidden && !reduced.matches && !lost) frame = requestAnimationFrame(animate);
    };
    const contextLost = () => { lost = true; cancelAnimationFrame(frame); };
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    resize();
    resume();
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", contextLost);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="foundry-shader" aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }} />;
}

export default FoundryShader;

