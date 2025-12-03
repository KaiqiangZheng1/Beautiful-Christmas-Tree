import React, { useMemo, useRef, useLayoutEffect, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { generateFoliageData, lerp, randomVector3 } from '../utils/math';

interface OrnamentData {
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  rotation: THREE.Euler;
  color: THREE.Color;
  targetScale: THREE.Vector3;
  chaosScale: THREE.Vector3;
  chaosTilt: number; // New: Random Z-rotation for natural feel in chaos mode
}

interface OrnamentsProps {
  mixFactor: number;
  type: 'BALL' | 'BOX' | 'STAR' | 'CANDY' | 'CRYSTAL' | 'PHOTO';
  count: number;
  colors?: string[];
  scale?: number;
  userImages?: string[];
}

// Helper to generate a procedural card texture
const generateCardTexture = (text: string, subtext: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Photo area placeholder
        // Pure black to represent "blank" picture area
        // The 3D frame provides the white border
        ctx.fillStyle = '#000000';
        ctx.fillRect(0,0, 256, 320);
        
        // Gold Text
        ctx.fillStyle = '#d4af37';
        ctx.font = '40px serif';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 280);
        ctx.font = '24px serif';
        ctx.fillStyle = '#888';
        ctx.fillText(subtext, 128, 310);
    }
    return new THREE.CanvasTexture(canvas);
}

// --- Base Mesh Component ---
const PhotoFrameMesh: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    texture: THREE.Texture;
}> = ({ item, mixFactor, texture }) => {
    const groupRef = useRef<THREE.Group>(null);
    const innerRef = useRef<THREE.Group>(null); // Inner group for tilt
    const photoMatRef = useRef<THREE.MeshStandardMaterial>(null); // Ref for dynamic lighting
    const frameMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const currentMixRef = useRef(1);
    
    // Temp vectors to avoid GC
    const vecPos = useMemo(() => new THREE.Vector3(), []);
    const vecScale = useMemo(() => new THREE.Vector3(), []);
    const vecWorld = useMemo(() => new THREE.Vector3(), []); // For world position calc

    // Calculate Dynamic Geometry based on Image Aspect Ratio
    const { frameArgs, photoArgs, photoPos } = useMemo(() => {
        const img = texture.image as any;
        const width = img?.width || 1;
        const height = img?.height || 1;
        const aspect = width / height;

        // Constraint: Longest side of the photo area ~ 0.85
        const maxSize = 0.85;
        let pw, ph;

        if (aspect >= 1) {
            // Landscape
            pw = maxSize;
            ph = maxSize / aspect;
        } else {
            // Portrait
            ph = maxSize;
            pw = maxSize * aspect;
        }

        // Polaroid Margins
        const mSide = 0.08;
        const mTop = 0.08;
        const mBottom = 0.20; // Reduced margin for sleek look

        const fw = pw + mSide * 2;
        const fh = ph + mTop + mBottom;

        // Offset photo to align correctly in the frame
        // Frame center is 0. Top is fh/2.
        // Photo Top = (fh/2) - mTop
        // Photo Center = Photo Top - (ph/2)
        const py = (fh / 2) - mTop - (ph / 2);

        return {
            frameArgs: [fw, fh, 0.05] as [number, number, number],
            photoArgs: [pw, ph] as [number, number],
            photoPos: [0, py, 0.03] as [number, number, number]
        };
    }, [texture]);

    useFrame((state, delta) => {
        if (!groupRef.current || !innerRef.current) return;
        const speed = 2.0 * delta;
        currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
        const t = currentMixRef.current;
        
        // 1. Position Interpolation
        vecPos.lerpVectors(item.chaosPos, item.targetPos, t);
        groupRef.current.position.copy(vecPos);
        
        // 2. Scale Interpolation with Dynamic Perspective
        vecScale.lerpVectors(item.chaosScale, item.targetScale, t);
        
        // Apply Exaggerated Perspective in Chaos Mode
        const effectStrength = (1.0 - t);
        
        if (t < 0.99) {
             // Get World Position to calculate distance to camera
             // We need this because the parent group is rotating
             groupRef.current.getWorldPosition(vecWorld);
             const distToCamera = vecWorld.distanceTo(state.camera.position);
             
             // Perspective Scale
             // Close (~10 units) -> Scale Up (1.5x)
             // Far (~60 units) -> Scale Down (0.6x)
             const perspectiveFactor = THREE.MathUtils.mapLinear(distToCamera, 10, 60, 1.5, 0.6);
             const dynamicScale = lerp(1.0, perspectiveFactor, effectStrength);
             vecScale.multiplyScalar(dynamicScale);

             // Dynamic Brightness (Emissive) - INCREASED FOR BRIGHTER LOOK
             if (photoMatRef.current) {
                 // Adjusted Intensity: 
                 const brightness = THREE.MathUtils.mapLinear(distToCamera, 12, 50, 0.9, 0.2);
                 photoMatRef.current.emissiveIntensity = Math.max(0.2, brightness) * effectStrength;
             }
        } else {
             // Formed State: Increased glow for visibility
             if (photoMatRef.current) photoMatRef.current.emissiveIntensity = 0.25;
        }

        groupRef.current.scale.copy(vecScale);

        // 3. Rotation Logic
        if (t > 0.8) {
             // Formed State: Face outward from tree center
             groupRef.current.lookAt(0, groupRef.current.position.y, 0); 
             groupRef.current.rotateY(Math.PI); 
             // Reset tilt in tree mode
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, 0, speed);
        } else {
             // Chaos State: Face the camera (Billboard)
             groupRef.current.lookAt(state.camera.position);
             // Apply random tilt for natural "tossed photo" look
             innerRef.current.rotation.z = lerp(innerRef.current.rotation.z, item.chaosTilt, speed);
        }
    });

    return (
        <group ref={groupRef}>
            {/* Inner group handles local tilt without breaking lookAt */}
            <group ref={innerRef}>
                {/* The Polaroid Frame (White Box) */}
                <mesh>
                    <boxGeometry args={frameArgs} />
                    <meshStandardMaterial 
                        ref={frameMatRef}
                        color="#ffffff" 
                        roughness={1.0} // Fully matte paper
                        metalness={0.0}
                        emissive="#ffffff" // Pure white emissive
                        emissiveIntensity={0.6} // Increased frame glow
                        toneMapped={false} 
                    />
                </mesh>
                
                {/* The Photo Image (Plane slightly in front) */}
                <mesh position={photoPos}>
                    <planeGeometry args={photoArgs} />
                    <meshStandardMaterial 
                        ref={photoMatRef}
                        map={texture} 
                        emissiveMap={texture} 
                        roughness={0.4} 
                        metalness={0.0}
                        color="white"
                        emissive="white" 
                        emissiveIntensity={0.25} // Increased photo glow
                        toneMapped={false} 
                    />
                </mesh>
            </group>
        </group>
    );
};

// --- User Photo Loader ---
const UserPhotoOrnament: React.FC<{
    item: OrnamentData;
    mixFactor: number;
    url: string;
}> = ({ item, mixFactor, url }) => {
    const texture = useLoader(THREE.TextureLoader, url);
    return <PhotoFrameMesh item={item} mixFactor={mixFactor} texture={texture} />;
};

// --- Fallback Wrapper (Suspense Handling) ---
const SuspensePhotoOrnament = (props: any) => {
     return (
        <React.Suspense fallback={
             // Render a simple white box while loading
             <group position={props.item.targetPos}>
                <mesh scale={props.item.targetScale}>
                    <boxGeometry args={[1, 1.2, 0.05]} />
                    <meshStandardMaterial color="#eee" />
                </mesh>
             </group>
        }>
            <UserPhotoOrnament {...props} />
        </React.Suspense>
    )
}

const Ornaments: React.FC<OrnamentsProps> = ({ mixFactor, type, count, colors, scale = 1, userImages = [] }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const currentMixRef = useRef(1);

  // Generate data once
  const data = useMemo(() => {
    const items: OrnamentData[] = [];
    const { target } = generateFoliageData(count, 18, 7);

    // Golden Angle for evenly distributing photos on a spiral (prevents overlap)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      let tPos: THREE.Vector3;

      if (type === 'PHOTO') {
          // PHOTO DISTRIBUTION: GOLDEN SPIRAL (TREE STATE)
          // Ensures no overlap on the tree
          
          const treeHeight = 18;
          const treeRadiusBase = 7.0;
          
          const verticalSpread = 16;
          const y = ((i / count) - 0.5) * verticalSpread;
          
          const hNormalized = (y + 9) / 18;
          const r = (1 - hNormalized) * treeRadiusBase;
          
          const finalR = r + 1.2;
          
          const theta = i * goldenAngle;
          
          tPos = new THREE.Vector3(
              finalR * Math.cos(theta),
              y,
              finalR * Math.sin(theta)
          );
          
      } else {
          // STANDARD ORNAMENTS
          tPos = new THREE.Vector3(target[i*3], target[i*3+1], target[i*3+2]);
          const pushOut = type === 'STAR' ? 1.15 : 1.08;
          tPos.multiplyScalar(pushOut);
      }

      // Chaos Position Logic
      let cPos: THREE.Vector3;
      let chaosTilt = 0;
      
      if (type === 'PHOTO') {
          // PHOTO CHAOS: CYLINDRICAL SPIRAL (UNFOLDED STATE)
          // Prevents stacking in the unfolded/chaos state by using deterministic math
          // instead of random values.
          
          const chaosRadius = 18; // Wide radius
          const chaosHeightRange = 12; // -6 to 6
          
          // Distribute height evenly based on index
          const yHeight = ((i / count) - 0.5) * chaosHeightRange;
          
          // Distribute angle evenly using Golden Angle to avoid vertical columns
          const theta = i * goldenAngle;
          
          cPos = new THREE.Vector3(
              chaosRadius * Math.cos(theta),
              yHeight,
              chaosRadius * Math.sin(theta)
          );
          
          // Deterministic tilt to maintain "messy" look without collisions
          chaosTilt = ((i % 5) - 2) * 0.15; 
      } else {
          // STANDARD LOGIC: Random Sphere explosion
          cPos = randomVector3(25);
      }

      const colorHex = colors ? colors[Math.floor(Math.random() * colors.length)] : '#ffffff';

      // Scaling Logic
      const baseScaleVec = new THREE.Vector3(1, 1, 1);
      const randScale = Math.random() * 0.4 + 0.8; // Variation
      
      if (type === 'CANDY') {
          baseScaleVec.set(0.2, 1.5, 0.2); // Stick shape
      } else if (type === 'PHOTO') {
          baseScaleVec.set(1.0, 1.0, 1.0); 
      } else if (type === 'STAR') {
          baseScaleVec.setScalar(1.2);
      }

      // Final Target Scale (Tree State)
      const targetScale = baseScaleVec.clone().multiplyScalar(scale * randScale);
      
      // Chaos Scale (Exploded State)
      let chaosScale = targetScale.clone();
      if (type === 'PHOTO') {
          // Magnify photos significantly when in chaos mode.
          const photoScale = 3.5 + Math.random() * 1.5;
          chaosScale.multiplyScalar(photoScale);
      }

      items.push({
        chaosPos: cPos,
        targetPos: tPos,
        rotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, 0),
        color: new THREE.Color(colorHex),
        targetScale: targetScale,
        chaosScale: chaosScale,
        chaosTilt: chaosTilt
      });
    }
    return items;
  }, [count, type, colors, scale]);

  // Pre-generate fallback textures for photos
  const fallbackTextures = useMemo(() => {
      if (type !== 'PHOTO') return [];
      return [
          generateCardTexture("Peace", "on Earth"),
          generateCardTexture("Joy", "to the World"),
          generateCardTexture("Merry", "Christmas"),
          generateCardTexture("Noel", "2024")
      ];
  }, [type]);

  // --- RENDERING STRATEGY ---
  
  // Layout Effect for initial InstancedMesh setup
  useLayoutEffect(() => {
     if (!meshRef.current || type === 'PHOTO') return;
     
     data.forEach((item, i) => {
         meshRef.current!.setColorAt(i, item.color);
         
         dummy.position.copy(item.targetPos);
         dummy.scale.copy(item.targetScale);
         dummy.rotation.copy(item.rotation);
         dummy.updateMatrix();
         meshRef.current!.setMatrixAt(i, dummy.matrix);
     });
     
     if (meshRef.current.instanceColor) {
         meshRef.current.instanceColor.needsUpdate = true;
     }
     meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data, type, dummy]);

  // Frame Loop for InstancedMesh (Photos handle their own frames)
  useFrame((state, delta) => {
    if (!meshRef.current || type === 'PHOTO') return;

    const speed = 2.0 * delta;
    currentMixRef.current = lerp(currentMixRef.current, mixFactor, speed);
    const t = currentMixRef.current;
    
    // Helper vectors for lerping
    const currentPos = new THREE.Vector3();
    const currentScale = new THREE.Vector3();

    data.forEach((item, i) => {
      // 1. Position
      currentPos.lerpVectors(item.chaosPos, item.targetPos, t);
      dummy.position.copy(currentPos);
      
      // 2. Rotation
      if (type === 'STAR' && t > 0.8) {
         dummy.lookAt(0, currentPos.y, 0); 
         dummy.rotateX(Math.PI / 2); // Orient star tip out
      } else {
         dummy.rotation.copy(item.rotation);
      }

      // 3. Scale
      currentScale.lerpVectors(item.chaosScale, item.targetScale, t);
      dummy.scale.copy(currentScale); 

      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (type === 'PHOTO') {
      return (
          <group>
              {data.map((item, i) => {
                  // Determine image source
                  let imgSrc: string | undefined = undefined;
                  if (userImages && userImages.length > 0) {
                      if (i < userImages.length) {
                           imgSrc = userImages[i];
                      }
                  } 
                  
                  const fallback = fallbackTextures[i % fallbackTextures.length];

                  if (imgSrc) {
                      return (
                          <SuspensePhotoOrnament
                            key={i}
                            item={item}
                            mixFactor={mixFactor}
                            url={imgSrc}
                          />
                      );
                  } else {
                      return (
                          <PhotoFrameMesh 
                            key={i} 
                            item={item} 
                            mixFactor={mixFactor}
                            texture={fallback} 
                          />
                      );
                  }
              })}
          </group>
      )
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      {type === 'BALL' && <sphereGeometry args={[1, 12, 12]} />} 
      {type === 'BOX' && <boxGeometry args={[1, 1, 1]} />}
      {type === 'STAR' && <octahedronGeometry args={[1, 0]} />}
      {type === 'CRYSTAL' && <dodecahedronGeometry args={[0.8, 0]} />}
      {type === 'CANDY' && <cylinderGeometry args={[0.3, 0.3, 1, 8]} />}
      
      <meshStandardMaterial roughness={0.15} metalness={0.95} />
    </instancedMesh>
  );
};

export default Ornaments;