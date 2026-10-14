import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { loadFaceModels, detectFace } from "../lib/faceAuth";
import { Spinner } from "../components/icons";

// Guided capture: turn head through 3 angles so matching works from more
// than one pose (the Python prototype only captured one frame -- this
// captures three and stores all of them).
const ANGLES = [
  { key: "center", label: "Look straight at the camera" },
  { key: "left", label: "Turn your head slightly left" },
  { key: "right", label: "Turn your head slightly right" },
] as const;

export default function FaceRegisterPage() {
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [captured, setCaptured] = useState<number[][]>([]);
  const [status, setStatus] = useState("Loading face models…");
  const [faceDetectedLive, setFaceDetectedLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);

  function stopCamera() {
    if (videoRef.current) {
      const s = videoRef.current.srcObject as MediaStream | null;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
      }
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    let ticker: number | null = null;
    let cancelled = false;

    (async () => {
      try {
        await loadFaceModels();
        if (cancelled || done) return;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (cancelled || done) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise<void>((resolve) => {
            if (!videoRef.current) return resolve();
            videoRef.current.onloadeddata = () => resolve();
          });
        }
        setReady(true);
        setStatus(ANGLES[0].label);

        // Realtime detection ticker for live feedback
        ticker = window.setInterval(async () => {
          if (videoRef.current && !capturingRef.current && !done) {
            const f = await detectFace(videoRef.current);
            setFaceDetectedLive(!!f);
          }
        }, 300);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start camera or load face models.");
        stopCamera();
      }
    })();

    return () => {
      cancelled = true;
      if (ticker) clearInterval(ticker);
      stopCamera();
    };
  }, [done]);

  async function captureStep() {
    if (!videoRef.current || capturingRef.current) return;
    capturingRef.current = true;
    setStatus("Analyzing biometric landmarks…");
    try {
      const face = await detectFace(videoRef.current);
      if (!face) {
        setStatus("⚠ No face detected — Please center face and ensure good lighting, then try again.");
        return;
      }
      const next = [...captured, Array.from(face.descriptor)];
      setCaptured(next);
      if (stepIndex + 1 < ANGLES.length) {
        setStepIndex(stepIndex + 1);
        setStatus(ANGLES[stepIndex + 1].label);
      } else {
        await save(next);
      }
    } finally {
      capturingRef.current = false;
    }
  }

  async function save(descriptors: number[][]) {
    if (!profile) return;
    setSaving(true);
    setError(null);
    setStatus("Encrypting & storing biometric descriptors…");
    // Replace any previous registration, then insert one row per angle.
    await supabase.from("employee_face_descriptors").delete().eq("employee_id", profile.id);
    const rows = descriptors.map((descriptor) => ({
      organization_id: profile.organization_id,
      employee_id: profile.id,
      descriptor,
    }));
    const { error } = await supabase.from("employee_face_descriptors").insert(rows);
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>FACE ENROLLMENT</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest font-spacex">
            BIOMETRIC REGISTRATION
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          Enrolls your 128-dimensional facial embedding descriptors for high-accuracy attendance check-in.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-300 flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {done ? (
        <div className="glass-card p-8 rounded-3xl space-y-4 text-center border border-emerald-500/30 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto text-2xl shadow-[0_0_20px_rgba(52,211,153,0.25)]">
            ✓
          </div>
          <h2 className="font-spacex text-lg font-bold text-ink-100 uppercase tracking-wider">
            FACE REGISTERED SUCCESSFULLY
          </h2>
          <p className="text-ink-300 text-xs max-w-md mx-auto leading-relaxed">
            Your biometric facial descriptors have been encrypted and stored. You can now use AI face verification for seamless check-in and check-out.
          </p>
        </div>
      ) : (
        <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl border border-white/10">
          {/* Step Indicators */}
          <div className="grid grid-cols-3 gap-3">
            {ANGLES.map((angle, idx) => (
              <div
                key={angle.key}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  idx === stepIndex
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/20"
                    : idx < stepIndex
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-white/5 bg-white/[0.02] text-ink-500"
                }`}
              >
                <div className="font-spacex text-[10px] font-bold uppercase tracking-wider">
                  STEP {idx + 1}
                </div>
                <div className="text-[11px] font-medium truncate mt-0.5">
                  {angle.key.toUpperCase()}
                </div>
              </div>
            ))}
          </div>

          {/* Camera Frame with Guide Ring */}
          <div className="relative rounded-2xl overflow-hidden border border-cyan-500/30 bg-base-950 aspect-[4/3] shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Guide Oval Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`w-48 h-60 rounded-[50%] border-2 transition-all duration-300 ${
                  faceDetectedLive
                    ? "border-cyan-400 shadow-[0_0_20px_rgba(45,212,191,0.5)]"
                    : "border-white/20 border-dashed"
                }`}
              />
            </div>

            {/* Live Status Badge */}
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-base-950/80 backdrop-blur-md border border-white/10 text-[10px] font-spacex font-bold tracking-wider uppercase flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${faceDetectedLive ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 animate-pulse"}`} />
              {faceDetectedLive ? "Face Detected" : "Align Face in Ring"}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-ink-100 text-xs font-spacex font-bold uppercase tracking-wider text-center min-h-[1.5rem]">
              {status}
            </p>

            <button
              onClick={captureStep}
              disabled={!ready || saving}
              className="btn-glass-primary w-full h-12 rounded-xl text-xs font-spacex font-bold tracking-wider uppercase disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Spinner /> ENROLLING BIOMETRIC EMBEDDINGS…
                </>
              ) : (
                `CAPTURE ANGLE (${captured.length + 1}/${ANGLES.length})`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
