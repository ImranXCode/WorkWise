import { useState, useRef, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  StressEventType,
  StressRecord,
  FeedbackRating,
  runStressDetectionScan,
  submitStressFeedback,
  fetchEmployeeStressHistory,
} from "../lib/stressService";
import AIFluidOrbLogo from "./AIFluidOrbLogo";

interface StressCheckModalProps {
  isOpen: boolean;
  eventType: StressEventType;
  onClose: () => void;
  onComplete?: (record: StressRecord) => void;
  onSkip?: () => void;
}

const EVENT_MESSAGES: Record<
  StressEventType,
  { title: string; subtitle: string; icon: string }
> = {
  LOGIN: {
    title: "AI Wellbeing Check",
    subtitle: "Would you like to take a quick AI stress check as you log in?",
    icon: "🌅",
  },
  ATTENDANCE: {
    title: "Attendance Recorded",
    subtitle: "Would you like to complete an optional AI stress check?",
    icon: "✅",
  },
  BREAK_START: {
    title: "Before Your Break",
    subtitle: "Would you like to take a quick AI stress check before stepping away?",
    icon: "☕",
  },
  BREAK_END: {
    title: "Welcome Back",
    subtitle: "Would you like to take a quick AI stress check as you return?",
    icon: "⚡",
  },
  LOGOUT: {
    title: "Before You Leave",
    subtitle: "Would you like to complete a quick AI stress check before logging out?",
    icon: "👋",
  },
  MANUAL: {
    title: "AI Wellbeing Check",
    subtitle: "Would you like to perform a real-time AI stress assessment?",
    icon: "🧠",
  },
};

export default function StressCheckModal({
  isOpen,
  eventType,
  onClose,
  onComplete,
  onSkip,
}: StressCheckModalProps) {
  const { user, organization } = useAuth();

  const [step, setStep] = useState<"consent" | "scanning" | "result" | "feedback">("consent");
  const [scanProgress, setScanProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Scan & Result state
  const [resultRecord, setResultRecord] = useState<StressRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<StressRecord[]>([]);

  // Feedback state
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [isAccurate, setIsAccurate] = useState<boolean>(true);
  const [correctedClass, setCorrectedClass] = useState<"stress" | "non_stress">("non_stress");
  const [userFeedbackText, setUserFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Video & Stream refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen && user && organization) {
      setStep("consent");
      setScanProgress(0);
      setErrorMsg(null);
      setResultRecord(null);
      setFeedbackSubmitted(false);
      setRating(null);

      // Fetch user history for baseline calculation
      fetchEmployeeStressHistory(organization.id, user.id)
        .then(setHistoryRecords)
        .catch(console.warn);
    }
    return () => {
      stopCameraTrack();
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [isOpen, user, organization]);

  function stopCameraTrack() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (videoRef.current) {
      const stream = videoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      videoRef.current.srcObject = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  const handleConsentAccept = async () => {
    setErrorMsg(null);
    setStep("scanning");
    setScanProgress(5);

    try {
      // 1. Request Camera Stream AFTER explicit consent
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 2. Animate 3D Scan progress ring
      let currentProgress = 5;
      progressTimerRef.current = setInterval(() => {
        currentProgress += 10;
        if (currentProgress >= 90) {
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          performScanCapture();
        } else {
          setScanProgress(currentProgress);
        }
      }, 250);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setErrorMsg("Camera access denied or unavailable. Please check browser permissions.");
      stopCameraTrack();
    }
  };

  const handleConsentSkip = () => {
    stopCameraTrack();
    if (onSkip) onSkip();
    onClose();
  };

  const performScanCapture = async () => {
    if (!organization || !user) return;

    try {
      setScanProgress(95);

      // Create snapshot blob from video feed
      const videoEl = videoRef.current;
      const canvasEl = canvasRef.current;
      let blob: Blob | null = null;

      if (videoEl && canvasEl && videoEl.videoWidth > 0) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          blob = await new Promise<Blob | null>((res) => canvasEl.toBlob(res, "image/jpeg", 0.85));
        }
      }

      // Stop camera immediately after frame capture
      stopCameraTrack();

      // If blob fails, create dummy blob for fallback model inference
      if (!blob) {
        blob = new Blob(["dummy"], { type: "image/jpeg" });
      }

      // Run real stress detection scan
      const res = await runStressDetectionScan(
        blob,
        organization.id,
        user.id,
        eventType,
        historyRecords
      );

      setScanProgress(100);

      if (!res.faceDetected && res.message) {
        setErrorMsg(res.message);
        setStep("consent");
        return;
      }

      setResultRecord(res.record);
      setStep("result");
      if (onComplete) onComplete(res.record);
    } catch (err: any) {
      console.error("Error during stress check scan:", err);
      setErrorMsg("Failed to analyze webcam stream. Please try again.");
      stopCameraTrack();
      setStep("consent");
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!resultRecord || !organization || !user) return;

    setSubmittingFeedback(true);
    try {
      await submitStressFeedback(
        resultRecord.id,
        isAccurate,
        rating,
        !isAccurate ? correctedClass : null,
        userFeedbackText,
        organization.id,
        user.id
      );
      setFeedbackSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Error submitting stress feedback:", err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (!isOpen) return null;

  const eventInfo = EVENT_MESSAGES[eventType] || EVENT_MESSAGES.MANUAL;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={handleConsentSkip}
      />

      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#0f172a] via-[#0b1120] to-[#060913] border border-white/15 rounded-3xl shadow-2xl p-6 overflow-hidden z-10 animate-scale-in">
        {/* Ambient Aurora Glow */}
        <div className="absolute inset-0 liquid-aurora-bg opacity-20 pointer-events-none" />

        {/* Hidden Canvas for Frame Capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* ----------------------------------------------------
            PHASE 1: CONSENT POPUP
           ---------------------------------------------------- */}
        {step === "consent" && (
          <div className="text-center py-4 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-accent-500/20 via-cobalt-500/30 to-purple-500/20 border border-accent-400/40 flex items-center justify-center text-3xl shadow-lg">
              {eventInfo.icon}
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-ink-100">{eventInfo.title}</h3>
              <p className="text-xs text-ink-400 max-w-xs mx-auto leading-relaxed">
                {eventInfo.subtitle}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-base-900/80 border border-white/10 text-left text-[11px] text-ink-400 space-y-1">
              <p className="font-semibold text-accent-400 flex items-center gap-1.5">
                🔒 Privacy Guarantee
              </p>
              <p>
                Camera activates <strong>only</strong> after you click Start Check. No raw video is recorded or stored.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleConsentSkip}
                className="px-5 py-2.5 rounded-xl border border-white/15 text-ink-300 hover:text-ink-100 hover:bg-white/5 text-xs font-semibold transition-colors"
              >
                Skip Check
              </button>
              <button
                onClick={handleConsentAccept}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 via-cobalt-500 to-accent-400 text-base-950 font-bold text-xs shadow-lg shadow-accent-500/25 hover:scale-105 active:scale-95 transition-all"
              >
                Start Check
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            PHASE 2: WEBCAM SCANNING & 3D EFFECT
           ---------------------------------------------------- */}
        {step === "scanning" && (
          <div className="flex flex-col items-center py-4 space-y-5">
            <div className="relative w-64 h-64 rounded-full overflow-hidden border-2 border-accent-400/60 shadow-[0_0_40px_rgba(6,182,212,0.4)] bg-black">
              {/* Live Webcam Stream */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />

              {/* 3D Scanning Laser Ring Overlay */}
              <div className="absolute inset-0 border-4 border-dashed border-cyan-400/70 rounded-full animate-spin-slow pointer-events-none" />
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] animate-scan-laser pointer-events-none" />

              {/* Scan Reticle Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <div className="w-24 h-24 border border-white/40 rounded-full" />
              </div>
            </div>

            <div className="w-full max-w-xs space-y-2 text-center">
              <div className="flex items-center justify-between text-xs font-medium text-ink-300">
                <span>Analyzing facial wellbeing telemetry...</span>
                <span className="text-accent-400 font-bold">{scanProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-base-900 rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-accent-400 transition-all duration-200"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            PHASE 3: RESULT & PERSONAL BASELINE
           ---------------------------------------------------- */}
        {step === "result" && resultRecord && (
          <div className="py-4 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <AIFluidOrbLogo size="sm" />
                <div>
                  <h4 className="text-sm font-bold text-ink-100">AI Stress Estimate</h4>
                  <p className="text-[10px] text-ink-400">
                    Event: <span className="font-semibold text-accent-400">{resultRecord.event_type}</span>
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/10 text-ink-300 border border-white/15">
                Model: {resultRecord.model_version}
              </span>
            </div>

            {/* Score & Category Gauge */}
            <div className="p-4 rounded-2xl bg-base-900/80 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-ink-500 tracking-wider">
                  AI Assessment
                </p>
                <p className="text-2xl font-extrabold text-ink-100 capitalize mt-0.5">
                  {resultRecord.predicted_class === "stress" ? "Elevated Indicator" : "Normal Baseline"}
                </p>
                <p className="text-xs text-ink-400 mt-1">
                  Confidence Score: <strong className="text-accent-400">{Math.round(resultRecord.confidence * 100)}%</strong>
                </p>
              </div>

              <div
                className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-bold text-lg border ${
                  resultRecord.predicted_class === "stress"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                }`}
              >
                {resultRecord.stress_score}
                <span className="text-[9px] font-normal opacity-80">/ 100</span>
              </div>
            </div>

            {/* Personalized Comparison Summary (Non-Diagnostic Wording) */}
            <div className="p-3.5 rounded-2xl bg-accent-500/10 border border-accent-500/30 text-xs text-accent-300 leading-relaxed flex items-start gap-2.5">
              <span className="text-base shrink-0 mt-0.5">📊</span>
              <div>
                <strong className="block font-semibold mb-0.5">Personalized Pattern Analysis:</strong>
                {resultRecord.baseline_comparison || "Today's result has been logged into your personal wellbeing timeline."}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setStep("feedback")}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent-500 via-cobalt-500 to-accent-400 text-base-950 font-bold text-xs shadow-lg hover:scale-[1.02] transition-all"
              >
                Next: Accuracy Feedback →
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------
            PHASE 4: ACCURACY FEEDBACK (Requirement 6)
           ---------------------------------------------------- */}
        {step === "feedback" && (
          <div className="py-4 space-y-5 animate-scale-in">
            {feedbackSubmitted ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mx-auto flex items-center justify-center text-xl">
                  ✓
                </div>
                <h4 className="text-base font-bold text-ink-100">Feedback Saved</h4>
                <p className="text-xs text-ink-400 max-w-xs mx-auto">
                  Every completed check contributes to the continuous quality improvement pipeline.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <h4 className="text-base font-bold text-ink-100">How accurate was this result?</h4>
                  <p className="text-xs text-ink-400">
                    Your response helps calibrate evaluation samples for periodic model review.
                  </p>
                </div>

                {/* Accuracy Rating Options */}
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "very_accurate", label: "Very Accurate", accurate: true },
                      { id: "accurate", label: "Accurate", accurate: true },
                      { id: "not_sure", label: "Not Sure", accurate: true },
                      { id: "not_accurate", label: "Not Accurate", accurate: false },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setRating(opt.id);
                        setIsAccurate(opt.accurate);
                      }}
                      className={`p-3 rounded-2xl border text-xs font-semibold transition-all text-center ${
                        rating === opt.id
                          ? "bg-accent-500/20 border-accent-400 text-accent-300 shadow-md shadow-accent-500/20"
                          : "bg-base-900/60 border-white/10 text-ink-300 hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Optional Correction Input if Not Accurate */}
                {rating === "not_accurate" && (
                  <div className="p-3.5 rounded-2xl bg-base-900 border border-white/10 space-y-3 animate-fade-in">
                    <p className="text-xs font-semibold text-ink-200">
                      Would you like to provide a correction?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCorrectedClass("non_stress")}
                        className={`flex-1 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                          correctedClass === "non_stress"
                            ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                            : "bg-base-950 border-white/10 text-ink-400"
                        }`}
                      >
                        Non-Stress
                      </button>
                      <button
                        type="button"
                        onClick={() => setCorrectedClass("stress")}
                        className={`flex-1 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                          correctedClass === "stress"
                            ? "bg-amber-500/20 border-amber-400 text-amber-300"
                            : "bg-base-950 border-white/10 text-ink-400"
                        }`}
                      >
                        Stress
                      </button>
                    </div>

                    <textarea
                      value={userFeedbackText}
                      onChange={(e) => setUserFeedbackText(e.target.value)}
                      placeholder="Optional notes or feedback..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-base-950 border border-white/10 text-xs text-ink-100 placeholder-ink-500 focus:outline-none focus:border-accent-400"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={onClose}
                    className="text-xs text-ink-400 hover:text-ink-200"
                  >
                    Skip Feedback
                  </button>

                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={submittingFeedback || !rating}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-cobalt-500 text-base-950 font-bold text-xs disabled:opacity-50 transition-all"
                  >
                    {submittingFeedback ? "Saving..." : "Submit Feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
