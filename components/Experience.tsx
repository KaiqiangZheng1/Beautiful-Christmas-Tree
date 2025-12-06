
import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import Foliage from './Foliage';
import Ornaments from './Ornaments';
import SpiralLights from './SpiralLights';
import Snow from './Snow';
import TopStar from './TopStar';
import { TreeColors } from '../types';

interface ExperienceProps {
  mixFactor: number;
  colors: TreeColors;
  inputRef: React.MutableRefObject<{ x: number, y: number, isDetected?: boolean }>;
  userImages?: string[];
  signatureText?: string;
}

// COLORS FOR REALISTIC OBJECTS
const BALL_COLORS = [
    '#8B0000', // Dark Red
    '#D32F2F', // Bright Red
    '#1B5E20', // Dark Green
    '#D4AF37', // Gold 
    '#C0C0C0', // Silver
    '#191970'  // Midnight Blue
]; 

const BOX_COLORS = [
    '#800000', // Maroon
    '#1B5E20', // Forest Green
    '#D4AF37', // Gold
    '#FFFFFF', // White
    '#4B0082', // Indigo/Deep Purple
    '#2F4F4F', // Dark Slate Gray
    '#008080', // Teal
    '#8B4513', // Bronze/SaddleBrown
    '#DC143C'  // Crimson
];

const STAR_COLORS = ['#FFD700', '#FDB931']; // Gold variations
const CRYSTAL_COLORS = ['#F0F8FF', '#E0FFFF', '#B0E0E6']; // Ice Blues and Whites for Snowflakes
// Set Candy base to white, as stripes are handled via texture in Ornaments.tsx
const CANDY_COLORS = ['#FFFFFF']; 

// Handles Camera Parallax, Tree Rotation (Drag) and Zoom (Wheel + Pinch)
const SceneController: React.FC<{ 
    inputRef: React.MutableRefObject<{ x: number, y: number, isDetected?: boolean }>, 
    groupRef: React.RefObject<THREE.Group> 
}> = ({ inputRef, groupRef }) => {
    const { camera, gl } = useThree();
    const vec = useMemo(() => new THREE.Vector3(), []);
    
    // Interaction State
    const zoomTarget = useRef(32); 
    const isDragging = useRef(false);
    const lastPointerX = useRef(0);
    
    // Touch Pinch State
    const lastTouchDistance = useRef<number | null>(null);
    
    // Physics State
    const rotationVelocity = useRef(0.002); // Start with slow auto-spin
    
    // Hand Control State
    const wasDetected = useRef(false); // To detect the "grab" frame
    const grabOffset = useRef(0);      // The rotation offset when grabbed
    
    // Smooth Input State (for Parallax)
    const currentInput = useRef({ x: 0, y: 0 }); 

    useEffect(() => {
        const canvas = gl.domElement;
        canvas.style.touchAction = 'none';

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomTarget.current += e.deltaY * 0.02;
            zoomTarget.current = THREE.MathUtils.clamp(zoomTarget.current, 12, 55);
        };

        const onPointerDown = (e: PointerEvent) => {
            // Allow primary pointer (mouse or first touch) to start dragging
            if (e.isPrimary && e.button === 0) { 
                isDragging.current = true;
                lastPointerX.current = e.clientX;
                canvas.setPointerCapture(e.pointerId);
                rotationVelocity.current = 0; // Stop auto-spin on grab
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            if (e.isPrimary) {
                isDragging.current = false;
                canvas.releasePointerCapture(e.pointerId);
            }
        };

        const onPointerMove = (e: PointerEvent) => {
            // Only rotate if primary pointer and NOT currently pinching
            if (e.isPrimary && isDragging.current && groupRef.current && lastTouchDistance.current === null) {
                const deltaX = e.clientX - lastPointerX.current;
                lastPointerX.current = e.clientX;
                // Mouse still uses impulse/velocity logic
                const rotationAmount = deltaX * 0.005;
                groupRef.current.rotation.y += rotationAmount;
                rotationVelocity.current = rotationAmount;
            }
        };

        // --- Touch Pinch Logic ---
        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                if (e.cancelable) e.preventDefault(); // Stop browser zoom/scroll

                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (lastTouchDistance.current !== null) {
                    const diff = lastTouchDistance.current - distance;
                    // Diff > 0: Pinched In -> Zoom Out (Increase Z)
                    // Diff < 0: Pinched Out -> Zoom In (Decrease Z)
                    
                    const sensitivity = 0.15; // Zoom speed multiplier
                    zoomTarget.current += diff * sensitivity;
                    zoomTarget.current = THREE.MathUtils.clamp(zoomTarget.current, 12, 55);
                }
                
                lastTouchDistance.current = distance;
            }
        };

        const onTouchEnd = () => {
            lastTouchDistance.current = null;
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerleave', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        
        // Touch Listeners
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);
        canvas.addEventListener('touchcancel', onTouchEnd);

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchcancel', onTouchEnd);
        };
    }, [gl, groupRef]);

    useFrame((state, delta) => {
        const safeDelta = Math.min(delta, 0.1);

        // 1. Smooth Input Interpolation (Parallax Logic)
        const targetX = inputRef.current.x;
        const targetY = inputRef.current.y;
        const isHandDetected = !!inputRef.current.isDetected;
        
        // Slower smoothing for parallax (hides jitter from AI)
        const inputSmoothing = 4.0 * safeDelta;
        currentInput.current.x = THREE.MathUtils.lerp(currentInput.current.x, targetX, inputSmoothing);
        currentInput.current.y = THREE.MathUtils.lerp(currentInput.current.y, targetY, inputSmoothing);

        // 2. Camera Update
        const camX = currentInput.current.x * 4; 
        const camY = currentInput.current.y * 2; 
        const camZ = zoomTarget.current + Math.abs(currentInput.current.x) * 2; 
        camera.position.lerp(vec.set(camX, camY, camZ), 4.0 * safeDelta); // Slightly faster camera catchup
        camera.lookAt(0, 0, 0);

        // 3. Tree Rotation Physics
        if (groupRef.current) {
            
            if (isHandDetected) {
                // --- HAND CONTROL (GRAB MODE) ---
                const HAND_ROTATION_FACTOR = Math.PI * 1.2; 
                const targetHandRotation = currentInput.current.x * HAND_ROTATION_FACTOR;

                if (!wasDetected.current) {
                    grabOffset.current = groupRef.current.rotation.y - targetHandRotation;
                    rotationVelocity.current = 0;
                }

                const targetAngle = targetHandRotation + grabOffset.current;
                const smoothFactor = 6.0 * safeDelta;
                
                const prevRot = groupRef.current.rotation.y;
                groupRef.current.rotation.y = THREE.MathUtils.lerp(prevRot, targetAngle, smoothFactor);
                
                rotationVelocity.current = (groupRef.current.rotation.y - prevRot);

                wasDetected.current = true;

            } else {
                // --- IDLE / MOUSE CONTROL (INERTIA MODE) ---
                if (wasDetected.current) {
                    if (Math.abs(rotationVelocity.current) < 0.0001) {
                        rotationVelocity.current = 0.002; 
                    }
                    wasDetected.current = false;
                }

                // Apply velocity if NOT dragging manually
                if (!isDragging.current) {
                    groupRef.current.rotation.y += rotationVelocity.current;
                    const baseSpeed = 0.002;
                    rotationVelocity.current = THREE.MathUtils.lerp(rotationVelocity.current, baseSpeed, safeDelta * 0.5);
                }
            }
        }
    });
    
    return null;
};

const SceneContent: React.FC<ExperienceProps> = ({ mixFactor, colors, inputRef, userImages, signatureText }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const photoCount = (userImages && userImages.length > 0) ? userImages.length : 10;

  return (
    <>
      <SceneController inputRef={inputRef} groupRef={groupRef} />
      
      <ambientLight intensity={0.4} />
      <spotLight position={[20, 20, 20]} angle={0.4} penumbra={1} intensity={2.0} color="#fff5d0" castShadow />
      <pointLight position={[-10, 5, -10]} intensity={1.2} color="#00ff00" />
      <pointLight position={[10, -5, 10]} intensity={1.2} color="#ff0000" />
      <pointLight position={[0, 10, 10]} intensity={0.5} color="#ffffff" />
      
      <Environment 
        files='public/hdri/potsdamer_platz_1k.hdr'
        background={false} 
      />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

      <Snow mixFactor={mixFactor} />

      <group ref={groupRef} position={[0, 0, 0]}>
        <TopStar mixFactor={mixFactor} />
        <Foliage mixFactor={mixFactor} colors={colors} />
        <SpiralLights mixFactor={mixFactor} />
        
        <Ornaments 
            mixFactor={mixFactor} 
            type="BALL" 
            count={60} 
            scale={0.5}
            colors={BALL_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="BOX" 
            count={30} 
            scale={0.6}
            colors={BOX_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="STAR" 
            count={25} 
            scale={0.5}
            colors={STAR_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="CRYSTAL" 
            count={40} 
            scale={0.4}
            colors={CRYSTAL_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="CANDY" 
            count={40} 
            scale={0.8}
            colors={CANDY_COLORS} 
        />
        <Ornaments 
            mixFactor={mixFactor} 
            type="PHOTO" 
            count={photoCount} 
            userImages={userImages}
            signatureText={signatureText}
        />
      </group>

      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom 
            luminanceThreshold={0.9} 
            mipmapBlur 
            intensity={1.2} 
            radius={0.6}
        />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
};

const Experience: React.FC<ExperienceProps> = (props) => {
  return (
    <Canvas
      dpr={[1, 1.25]} 
      // OPTIMIZATION: Tighten near/far planes to increase depth buffer precision on mobile.
      // 5-80 covers the tree nicely (centered at 0, camera at 32).
      camera={{ position: [0, 0, 32], fov: 45, near: 5, far: 80 }}
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      shadows
      style={{ touchAction: 'none' }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
};

export default Experience;
