
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/handpose';

interface GestureControllerProps {
  onGesture: (data: { isOpen: boolean; position: { x: number; y: number }, isDetected: boolean }) => void;
  isGuiVisible: boolean;
}

const GestureController: React.FC<GestureControllerProps> = ({ onGesture, isGuiVisible }) => {
  const webcamRef = useRef<Webcam>(null);
  const [model, setModel] = useState<handpose.HandPose | null>(null);
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState(false);
  const [debugState, setDebugState] = useState<string>("-");
  const [loadingMessage, setLoadingMessage] = useState("Initializing AI Engine...");
  
  const onGestureRef = useRef(onGesture);
  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  const lastDetectionTime = useRef(0);
  
  // STABILIZATION REFS
  const ratioHistory = useRef<number[]>([]); // Store last N ratios for smoothing
  const posHistory = useRef<{x:number, y:number}[]>([]); // Store last N positions for smoothing
  const isCurrentlyOpen = useRef<boolean>(false); // Track internal state for hysteresis
  const missedFrames = useRef(0); // Debounce for tracking loss

  // Load Model
  useEffect(() => {
    let isMounted = true;
    
    const loadModel = async () => {
      try {
        setLoadingMessage("Connecting to GPU...");
        await tf.ready();
        
        if (isMounted) setLoadingMessage("Loading Local AI Model...");
        
        const LOCAL_MODEL_URL = 'public/models/handpose/model.json';

        // Fix: Cast configuration to any to bypass type check for modelUrl support
        const net = await handpose.load({
            modelUrl: LOCAL_MODEL_URL
        } as any);
        
        if (isMounted) {
          setModel(net);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load handpose model:", err);
        if (isMounted) {
            setLoadingMessage("Network Error: Check Connection");
        }
      }
    };

    const timeoutId = setTimeout(() => {
        if (loading && isMounted) {
            setLoadingMessage("Downloading (First Run Takes Time)...");
        }
    }, 5000);

    loadModel();

    return () => {
        isMounted = false;
        clearTimeout(timeoutId);
    };
  }, []);

  // Loop
  const runDetection = useCallback(async () => {
    if (model && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      
      const now = Date.now();
      // Throttle detection to every 100ms (~10 FPS) to free up GPU for 3D rendering
      if (now - lastDetectionTime.current < 100) {
        requestAnimationFrame(runDetection);
        return;
      }
      lastDetectionTime.current = now;

      const video = webcamRef.current.video;
      
      // Safety Check: Video Dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
          requestAnimationFrame(runDetection);
          return;
      }

      try {
        const predictions = await model.estimateHands(video);

        if (predictions.length > 0) {
          missedFrames.current = 0;
          
          const hand = predictions[0];
          const landmarks = hand.landmarks;
          const wrist = landmarks[0];

          if (!wrist || !Number.isFinite(wrist[0]) || !Number.isFinite(wrist[1])) {
              requestAnimationFrame(runDetection);
              return;
          }

          // --- 1. Position Calculation ---
          const rawX = -1 * ((wrist[0] / video.videoWidth) * 2 - 1); 
          const rawY = -1 * ((wrist[1] / video.videoHeight) * 2 - 1);
          
          posHistory.current.push({x: rawX, y: rawY});
          if (posHistory.current.length > 8) posHistory.current.shift(); 

          const avgPos = posHistory.current.reduce((acc, curr) => ({ x: acc.x + curr.x, y: acc.y + curr.y }), {x:0, y:0});
          const count = posHistory.current.length;
          const x = avgPos.x / count;
          const y = avgPos.y / count;

          // --- 2. Gesture Detection ---
          const tips = [8, 12, 16, 20]; 
          const bases = [5, 9, 13, 17];

          const getDist = (p1: number[], p2: number[]) => {
             return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
          };

          let totalBaseDist = 0;
          let totalTipDist = 0;

          for(let i=0; i<4; i++) {
              totalBaseDist += getDist(wrist, landmarks[bases[i]]);
              totalTipDist += getDist(wrist, landmarks[tips[i]]);
          }

          const avgBaseDist = totalBaseDist / 4;
          const avgTipDist = totalTipDist / 4;
          const rawRatio = avgTipDist / (avgBaseDist || 1);
          
          ratioHistory.current.push(rawRatio);
          if (ratioHistory.current.length > 5) ratioHistory.current.shift();
          const smoothedRatio = ratioHistory.current.reduce((a,b) => a+b, 0) / ratioHistory.current.length;

          if (!isCurrentlyOpen.current && smoothedRatio > 1.6) {
             isCurrentlyOpen.current = true;
          } else if (isCurrentlyOpen.current && smoothedRatio < 1.2) {
             isCurrentlyOpen.current = false;
          }

          const isOpen = isCurrentlyOpen.current;
          const stateLabel = isOpen ? `OPEN` : `CLOSED`;
          setDebugState(stateLabel);

          if (onGestureRef.current) {
            onGestureRef.current({ isOpen, position: { x, y }, isDetected: true });
          }
        } else {
          missedFrames.current++;
          if (missedFrames.current > 5) {
              isCurrentlyOpen.current = false; 
              ratioHistory.current = []; 
              posHistory.current = []; 
              setDebugState("NO HAND");
              if (onGestureRef.current) {
                onGestureRef.current({ isOpen: false, position: {x:0, y:0}, isDetected: false });
              }
          }
        }
      } catch (err) {
        // Suppress ephemeral errors
      }
    }
    requestAnimationFrame(runDetection);
  }, [model]);

  useEffect(() => {
    if (model && !loading) {
      const timer = requestAnimationFrame(runDetection);
      return () => cancelAnimationFrame(timer);
    }
  }, [model, loading, runDetection]);

  // Constrain mobile size strictly to w-28 h-36 (Portrait) 
  // IMPORTANT: Do NOT add w-full h-full to the inner div, it will cause the video to expand to intrinsic size.
  const boxStyle = "w-28 h-36 md:w-48 md:h-36 rounded-lg border-[#d4af37]/50 bg-black/90 border overflow-hidden shadow-[0_0_20px_rgba(212,175,55,0.2)]";

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 transition-all duration-500 ease-in-out ${
        isGuiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
    >
      <div className={`relative ${boxStyle}`}>
          
          {cameraError ? (
             <div className="flex flex-col items-center justify-center h-full text-[#d4af37] p-2 text-center gap-2">
                <span className="text-xl">📷</span>
                <span className="text-[10px] font-luxury uppercase tracking-widest">Camera Unavailable</span>
                <span className="text-[9px] text-white/50">Use mouse instead</span>
             </div>
          ) : (
            <>
                <Webcam
                    ref={webcamRef}
                    mirrored={true}
                    videoConstraints={{ facingMode: "user" }}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${loading ? 'opacity-20' : 'opacity-80'}`}
                    onUserMediaError={() => setCameraError(true)}
                />
                {!loading && <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#d4af37]/10 to-transparent animate-scan pointer-events-none" />}
            </>
          )}
          
          {loading && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#d4af37] gap-2 p-4 bg-black/80 backdrop-blur-sm">
                  <div className="w-5 h-5 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[9px] font-luxury uppercase tracking-widest text-center animate-pulse">{loadingMessage}</span>
              </div>
          )}
          
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-6 pb-2 px-3 flex flex-col md:flex-row justify-end md:justify-between items-start md:items-end gap-0 md:gap-0">
            <span className="text-[9px] md:text-[8px] text-[#d4af37]/80 font-luxury tracking-widest uppercase mb-0.5 md:mb-0">Sensors</span>
            <span className={`text-[11px] md:text-[9px] font-mono font-bold ${debugState.includes("OPEN") ? "text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]" : "text-[#d4af37]"}`}>
                {debugState}
            </span>
          </div>
      </div>
      
      <style>{`
        @keyframes scan {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(100%); }
        }
        .animate-scan {
            animation: scan 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default GestureController;
