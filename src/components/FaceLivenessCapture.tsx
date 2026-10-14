import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  loadFaceModels,
  detectFace,
  spoofProbability,
  matchFace,
  yawRatio,
  SPOOF_THRESHOLD,
  type KnownFace,
} from "../lib/faceAuth";

type StepId = "center" | "turnA" | "turnB" | "hold";

const STEPS: { id: StepId; label: string; instruction: string }[] = [
  { id: "center", label: "Center", instruction: "Center your face in the frame" },
  { id: "turnA", label: "Turn", instruction: "Slowly turn your head to one side" },
  { id: "turnB", label: "Turn back", instruction: "Now turn your head the other way" },
  { id: "hold", label: "Hold", instruction: "Hold still while we verify it's you" },
];

const CENTER_TOLERANCE = 0.16; // |yaw - 0.5| under this counts as "centered"
const TURN_THRESHOLD = 0.12; // |yaw - 0.5| over this counts as "turned"
const POSE_FRAMES_TO_CONFIRM = 3; // consecutive good frames to pass a pose step
const HOLD_STREAK_REQUIRED = 5; // consecutive real+matched frames to mark attendance
const TICK_DELAY_MS = 100;

export type FaceLivenessResult = { faceVerified: boolean; confidence: number };

type Phase = "loading" | "active" | "success" | "error";

export default function FaceLivenessCapture({
  employeeId,
  onCancel,
  onVerified,
}: {
  employeeId: string;
  onCancel: () => void;
  onVerified: (result: FaceLivenessResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [status, setStatus] = useState("Loading face models\u2026");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const stepIndexRef = useRef(0);
  const poseStreakRef = useRef(0);
  const turnASignRef = useRef(1);
  const holdStreakRef = useRef(0);
  const bestConfidenceRef = useRef(0);
  const knownFacesRef = useRef<KnownFace[]>([]);

  useEffect(() => {
    cancelledRef.current = false;
    start();
    return () => {
      cancelledRef.current = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
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

  async function start() {
    setPhase("loading");
    setErrorMsg(null);
    setStatus("Loading face models\u2026");
    try {
      await loadFaceModels();

      setStatus("Starting camera\u2026");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (cancelledRef.current) {
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

      const { data, error } = await supabase
        .from("employee_face_descriptors")
        .select("employee_id, descriptor")
        .eq("employee_id", employeeId);
      if (error) throw new Error(error.message);

      const known = (data ?? []).map((k) => ({
        employeeId: k.employee_id,
        descriptor: k.descriptor as number[],
      }));

      if (known.length === 0) {
        setPhase("error");
        setErrorMsg("No face descriptor registered yet. Please register your face descriptor first.");
        return;
      }

      knownFacesRef.current = known;
      stepIndexRef.current = 0;
      poseStreakRef.current = 0;
      holdStreakRef.current = 0;
      bestConfidenceRef.current = 0;
      setStepIndex(0);
      setStepProgress(0);
      setPhase("active");
      setStatus(STEPS[0].instruction);
      scheduleTick();
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Could not start the camera.");
    }
  }

  function scheduleTick() {
    if (cancelledRef.current) return;
    timerRef.current = window.setTimeout(tick, TICK_DELAY_MS);
  }

  async function tick() {
    if (cancelledRef.current || !videoRef.current) return;

    try {
      const face = await detectFace(videoRef.current);
      if (!face) {
        poseStreakRef.current = 0;
        holdStreakRef.current = 0;
        setStepProgress(0);
        setStatus("No face detected\u2026 center your face in the frame");
        scheduleTick();
        return;
      }

      const step = STEPS[stepIndexRef.current].id;

      if (step === "hold") {
        await runHoldStep(face);
        return;
      }

      const dev = yawRatio(face.landmarks) - 0.5;
      let good = false;

      if (step === "center") {
        good = Math.abs(dev) < CENTER_TOLERANCE;
      } else if (step === "turnA") {
        good = Math.abs(dev) > TURN_THRESHOLD;
        if (good) turnASignRef.current = Math.sign(dev) || 1;
      } else if (step === "turnB") {
        good = Math.sign(dev) === -turnASignRef.current && Math.abs(dev) > TURN_THRESHOLD;
      }

      poseStreakRef.current = good ? poseStreakRef.current + 1 : 0;
      setStepProgress(Math.min(1, poseStreakRef.current / POSE_FRAMES_TO_CONFIRM));

      if (poseStreakRef.current >= POSE_FRAMES_TO_CONFIRM) {
        const next = stepIndexRef.current + 1;
        stepIndexRef.current = next;
        poseStreakRef.current = 0;
        setStepIndex(next);
        setStepProgress(0);
        setStatus(STEPS[next].instruction);
      } else if (!good) {
        setStatus(STEPS[stepIndexRef.current].instruction);
      }

      scheduleTick();
    } catch (e) {
      console.error("Face liveness tick error:", e);
      setStatus(e instanceof Error ? `Error: ${e.message}` : "Something went wrong \u2014 check console.");
      scheduleTick();
    }
  }

  async function runHoldStep(face: Awaited<ReturnType<typeof detectFace>>) {
    if (!face || !videoRef.current) {
      scheduleTick();
      return;
    }

    const spoof = await spoofProbability(videoRef.current, face.box);
    // TEMP DEBUG: remove once liveness threshold/calibration is confirmed working.
    console.log("[liveness debug] spoof probability:", spoof, "threshold:", SPOOF_THRESHOLD);
    if (spoof !== null && spoof > SPOOF_THRESHOLD) {
      holdStreakRef.current = 0;
      setStepProgress(0);
      setStatus("Liveness check failed \u2014 use your live camera, not a photo.");
      scheduleTick();
      return;
    }

    const match = matchFace(face.descriptor, knownFacesRef.current);
    if (!match) {
      holdStreakRef.current = 0;
      setStepProgress(0);
      setStatus("Face not recognized.");
      scheduleTick();
      return;
    }

    holdStreakRef.current += 1;
    bestConfidenceRef.current = Math.max(bestConfidenceRef.current, Math.max(0, 1 - match.distance));
    setStepProgress(Math.min(1, holdStreakRef.current / HOLD_STREAK_REQUIRED));
    setStatus(`Verifying\u2026 ${holdStreakRef.current}/${HOLD_STREAK_REQUIRED}`);

    if (holdStreakRef.current >= HOLD_STREAK_REQUIRED) {
      cancelledRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase("success");
      setStatus("Verified!");
      onVerified({ faceVerified: spoof !== null, confidence: bestConfidenceRef.current });
      return;
    }

    scheduleTick();
  }

  function handleCancel() {
    cancelledRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onCancel();
  }

  const overallProgress = Math.min(100, ((stepIndex + stepProgress) / STEPS.length) * 100);
  const currentStep = STEPS[Math.min(stepIndex, STEPS.length - 1)];

  return (
    <div className="rounded-xl border border-base-600 bg-base-900 p-6 max-w-sm">
      <div className="relative w-56 h-56 mx-auto mb-5">
        {/* conic progress ring */}
        <div
          className="absolute inset-0 rounded-full transition-[background] duration-200"
          style={{
            background: `conic-gradient(rgb(var(--c-accent-500)) ${overallProgress}%, rgb(var(--c-base-700)) ${overallProgress}%)`,
          }}
        />
        <div className="absolute inset-[4px] rounded-full bg-base-900" />

        {/* video circle */}
        <div className="absolute inset-[9px] rounded-full overflow-hidden bg-base-800">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {phase === "active" && currentStep.id === "center" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-24 h-24 rounded-full border-2 border-accent-500/70 animate-face-glow-pulse" />
            </div>
          )}

          {phase === "active" && (currentStep.id === "turnA" || currentStep.id === "turnB") && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-5xl animate-face-wobble select-none">{"\u{1F464}"}</div>
            </div>
          )}

          {phase === "active" && currentStep.id === "hold" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-28 h-28 rounded-full border-2 border-accent-500 animate-face-glow-pulse" />
            </div>
          )}

          {phase === "success" && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-950/60">
              <svg
                className="w-16 h-16 text-accent-500 animate-face-pop-in"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.35" />
                <path d="M7 12.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}

          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-950/70 animate-face-shake">
              <span className="text-3xl">{"\u26A0\uFE0F"}</span>
            </div>
          )}
        </div>
      </div>

      {/* step dots */}
      <div className="flex justify-center gap-2 mb-4">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < stepIndex || phase === "success"
                ? "w-6 bg-accent-500"
                : i === stepIndex
                ? "w-6 bg-accent-500/50"
                : "w-1.5 bg-base-600"
            }`}
          />
        ))}
      </div>

      <p className="text-center text-ink-100 text-sm font-medium min-h-[20px]">{status}</p>
      {errorMsg && <p className="text-center text-red-400 text-xs mt-2">{errorMsg}</p>}

      <div className="mt-5 flex gap-2">
        {phase === "error" ? (
          <button
            onClick={start}
            className="flex-1 h-9 rounded-lg bg-accent-500 hover:bg-accent-400 transition-colors text-base-950 text-xs font-semibold"
          >
            Try again
          </button>
        ) : null}
        <button
          onClick={handleCancel}
          className="flex-1 h-9 rounded-lg bg-base-700 hover:bg-base-600 transition-colors text-ink-100 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
