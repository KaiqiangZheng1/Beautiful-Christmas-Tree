
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp } from '../utils/math';

const snowVertexShader = `
  precision highp float;
  uniform float uTime; // Global Time
  uniform float uMix;  // Still used for drift amplitude
  
  attribute float aScale;
  attribute vec3 aVelocity;
  
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    
    // Physics
    // Fall down based on Global Time.
    float fallSpeed = aVelocity.y; 
    
    pos.y = mod(pos.y - uTime * fallSpeed + 15.0, 30.0) - 15.0; // Wrap Y (-15 to 15)
    
    // Side drift
    // uMix still controls the Amplitude of the drift (Chaos = wider drift)
    float drift = sin(uTime * aVelocity.x + pos.y) * (0.5 + (1.0 - uMix) * 2.0);
    pos.x += drift;
    pos.z += cos(uTime * aVelocity.z + pos.x) * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size
    gl_PointSize = aScale * (15.0 / -mvPosition.z);
    
    // Fade at edges of box
    vAlpha = 1.0 - smoothstep(12.0, 15.0, abs(pos.y));
  }
`;

const snowFragmentShader = `
  precision highp float;
  varying float vAlpha;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    
    float alpha = (1.0 - smoothstep(0.3, 0.5, dist)) * vAlpha * 0.8;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

const Snow: React.FC<{ mixFactor: number }> = ({ mixFactor }) => {
  // RESTORED: Full snow count
  const count = 3000;

  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const currentMixRef = useRef(1);
  const { camera } = useThree();

  const { positions, scales, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sc = new Float32Array(count);
    const vel = new Float32Array(count * 3);
    
    for(let i=0; i<count; i++) {
        // Random box -25 to 25 (Slightly larger to cover screen edges)
        pos[i*3] = (Math.random() - 0.5) * 50;
        pos[i*3+1] = (Math.random() - 0.5) * 30; // Y height
        pos[i*3+2] = (Math.random() - 0.5) * 40; // Z depth
        
        sc[i] = Math.random() * 2 + 1;
        
        vel[i*3] = Math.random() * 0.5 + 0.2; // Drift freq
        vel[i*3+1] = Math.random() * 2.0 + 1.0; // Fall speed
        vel[i*3+2] = Math.random() * 0.5 + 0.2;
    }
    return { positions: pos, scales: sc, velocities: vel };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMix: { value: 1 }
  }), []);

  useFrame((state, delta) => {
     if (materialRef.current && pointsRef.current) {
         currentMixRef.current = lerp(currentMixRef.current, mixFactor, delta * 2.0);
         
         materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
         materialRef.current.uniforms.uMix.value = currentMixRef.current;

         pointsRef.current.position.x = camera.position.x;
         pointsRef.current.position.y = camera.position.y;
     }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aScale" count={count} array={scales} itemSize={1} />
        <bufferAttribute attach="attributes-aVelocity" count={count} array={velocities} itemSize={3} />
      </bufferGeometry>
      <shaderMaterial 
        ref={materialRef}
        vertexShader={snowVertexShader}
        fragmentShader={snowFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
};

export default Snow;
