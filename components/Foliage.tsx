
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { generateFoliageData, lerp } from '../utils/math';

const vertexShader = `
  precision highp float;
  uniform float uTime;
  uniform float uMix;
  uniform float uSize;
  
  attribute vec3 aTargetPos;
  attribute vec3 aChaosPos;
  attribute float aRandom;
  
  varying vec3 vPos;
  varying float vRandom;
  varying float vIsSnow;

  void main() {
    vRandom = aRandom;
    vIsSnow = step(0.85, aRandom); // Top 15% random values become snow

    // Interpolate position
    vec3 pos = mix(aChaosPos, aTargetPos, uMix);
    
    // Breathing effect
    float breath = sin(uTime + pos.y * 0.5) * 0.05 * uMix;
    pos.x += pos.x * breath;
    pos.z += pos.z * breath;

    vPos = pos;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation
    gl_PointSize = uSize * (20.0 / -mvPosition.z) * (0.6 + 0.8 * aRandom);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec3 uColorBottom;
  uniform vec3 uColorTop;
  
  varying vec3 vPos;
  varying float vRandom;
  varying float vIsSnow;

  void main() {
    // Exact height normalization for tree (-9 to 9)
    float h = (vPos.y + 9.0) / 18.0;
    h = clamp(h, 0.0, 1.0);
    
    // Mix gradient
    vec3 color = mix(uColorBottom, uColorTop, h);
    
    // Depth Variation
    color *= 0.6 + 0.6 * vRandom;

    // Apply Snow
    // If vIsSnow is 1.0, mix with white
    vec3 snowColor = vec3(0.95, 0.98, 1.0);
    color = mix(color, snowColor, vIsSnow * 0.9); // 90% white blend

    // Circular particle
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    
    // Soft edge
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    gl_FragColor = vec4(color, alpha);
  }
`;

interface FoliageProps {
  mixFactor: number; 
  colors: { bottom: string, top: string };
}

const Foliage: React.FC<FoliageProps> = ({ mixFactor, colors }) => {
  // RESTORED: Full particle count for high fidelity on all devices
  const count = 75000; 
  
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const currentMixRef = useRef(1);
  
  const { target, chaos, randoms } = useMemo(() => generateFoliageData(count, 18, 7.5), [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMix: { value: 1 },
    uSize: { value: 4.0 }, 
    uColorBottom: { value: new THREE.Color(colors.bottom) },
    uColorTop: { value: new THREE.Color(colors.top) }
  }), []);

  useFrame((state, delta) => {
    if (materialRef.current) {
      const speed = 2.0 * delta; 
      currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);

      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uMix.value = currentMixRef.current;
      
      materialRef.current.uniforms.uColorBottom.value.set(colors.bottom);
      materialRef.current.uniforms.uColorTop.value.set(colors.top);
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={target} 
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aTargetPos"
          count={count}
          array={target}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aChaosPos"
          count={count}
          array={chaos}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={count}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
};

export default Foliage;
