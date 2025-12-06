
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lerp } from '../utils/math';

interface TopStarProps {
  mixFactor: number;
}

const createStarShape = (outerRadius: number, innerRadius: number, points: number) => {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / (points * 2);
    
    // Start at top
    shape.moveTo(0, outerRadius);
    
    for(let i = 0; i < points * 2; i++) {
        const radius = (i % 2 === 0) ? outerRadius : innerRadius;
        const angle = i * step;
        // Standard angle starts at 3 o'clock. We want top point at 12 o'clock.
        // Rotation offset = PI/2.
        const effectiveAngle = angle + Math.PI / 2;
        shape.lineTo(Math.cos(effectiveAngle) * radius, Math.sin(effectiveAngle) * radius);
    }
    shape.closePath();
    return shape;
};

const TopStar: React.FC<TopStarProps> = ({ mixFactor }) => {
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const starMeshRef = useRef<THREE.Mesh>(null);
  const currentMixRef = useRef(1);
  
  // Create Geometry once
  const geometry = useMemo(() => {
      const shape = createStarShape(1.2, 0.6, 5);
      const geom = new THREE.ExtrudeGeometry(shape, {
          depth: 0.4,
          bevelEnabled: true,
          bevelThickness: 0.1,
          bevelSize: 0.1,
          bevelSegments: 4
      });
      geom.center();
      return geom;
  }, []);

  useFrame((state, delta) => {
      if (!groupRef.current || !visualRef.current || !starMeshRef.current) return;

      const speed = 2.0 * delta;
      currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
      const t = currentMixRef.current;

      // 1. Position Logic
      // Formed: Top of tree (y=9.2)
      // Chaos: Floating upwards (y=13)
      const targetY = 9.2;
      const chaosY = 13.0;
      const currentY = lerp(chaosY, targetY, t);
      
      groupRef.current.position.set(0, currentY, 0);

      // 2. Rotation Logic
      // Always slowly spin the mesh itself
      starMeshRef.current.rotation.y += delta * 0.5;
      
      // Apply chaos tilt to the main group
      if (t < 0.9) {
          const chaosTilt = (1 - t) * 0.5;
          groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime) * chaosTilt;
          groupRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.8) * chaosTilt;
      } else {
          groupRef.current.rotation.z = lerp(groupRef.current.rotation.z, 0, speed);
          groupRef.current.rotation.x = lerp(groupRef.current.rotation.x, 0, speed);
      }

      // 3. Scale Logic
      // Static scale to prevent flickering/pulsing artifacts
      visualRef.current.scale.setScalar(1.0);
  });

  return (
    <group ref={groupRef}>
        {/* Visuals Group */}
        <group ref={visualRef}>
            {/* The Physical Star - Removed castShadow to prevent tree flickering */}
            <mesh ref={starMeshRef} geometry={geometry}>
                <meshStandardMaterial 
                    color="#FFD700" 
                    emissive="#FFD700"
                    emissiveIntensity={2.0} // Very bright
                    roughness={0.1}
                    metalness={0.9}
                    toneMapped={false} // Allow it to bloom heavily
                />
            </mesh>
        </group>

        {/* Inner Light Source - Remains stable in scale */}
        <pointLight 
            color="#ffeebf" 
            intensity={3.0} 
            distance={15} 
            decay={2} 
        />
    </group>
  );
};

export default TopStar;
