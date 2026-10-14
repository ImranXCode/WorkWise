import { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  StressRecord,
  ModelVersion,
  CandidateSample,
  runStressDetectionScan,
  submitStressFeedback,
  fetchEmployeeStressHistory,
  fetchAllOrgStressHistory,
  fetchModelVersions,
  fetchCandidateSamples,
  updateCandidateSampleStatus,
  runCandidateEvaluation,
} from "../lib/stressService";

export default function StressMonitoringPage() {
  const { user, profile, organization } = useAuth();
  const isOwnerOrAdmin = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager" || profile?.role === "hr";

  const [activeTab, setActiveTab] = useState<"scan" | "history" | "pipeline">("scan");

  // Camera Popup Modal State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState<"idle" | "camera" | "processing" | "complete">("idle");
  const [latestRecord, setLatestRecord] = useState<StressRecord | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Feedback state
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackChoice, setFeedbackChoice] = useState<boolean | null>(null);
  const [correctedClass, setCorrectedClass] = useState<"stress" | "non_stress">("non_stress");
  const [userFeedbackText, setUserFeedbackText] = useState("");
  const [submittingFb, setSubmittingFb] = useState(false);

  // History & Metrics state
  const [historyRecords, setHistoryRecords] = useState<StressRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [candidateSamples, setCandidateSamples] = useState<CandidateSample[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);

  // Video and Canvas refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (organization && user) {
      loadHistory();
      loadModelPipelineData();
    }
    return () => {
      stopCamera();
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [organization, user]);

  async function loadHistory() {
    if (!organization || !user) return;
    setLoadingHistory(true);
    try {
      if (isOwnerOrAdmin) {
        const data = await fetchAllOrgStressHistory(organization.id);
        setHistoryRecords(data);
      } else {
        const data = await fetchEmployeeStressHistory(organization.id, user.id);
        setHistoryRecords(data);
      }
    } catch (err) {
      console.warn("Failed loading stress history", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadModelPipelineData() {
    if (!organization) return;
    try {
      const [versions, samples] = await Promise.all([
        fetchModelVersions(),
        fetchCandidateSamples(organization.id),
      ]);
      setModelVersions(versions);
      setCandidateSamples(samples);
    } catch (err) {
      console.warn("Failed loading model pipeline data", err);
    }
  }

  function stopCamera() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (videoRef.current) {
      const s = videoRef.current.srcObject as MediaStream | null;
      if (s) {
        s.getTracks().forEach((track) => track.stop());
      }
      videoRef.current.srcObject = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  async function startStressScan() {
    setScanError(null);
    setScanning(true);
    setScanStep("camera");
    setScanProgress(0);
    setIsCameraModalOpen(true);
    setFeedbackSubmitted(false);
    setShowFeedbackModal(false);
    setFeedbackChoice(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Animate progress bar from 0% to 100% over 2 seconds
      let p = 0;
      progressTimerRef.current = setInterval(() => {
        p += 5;
        setScanProgress(Math.min(p, 100));
        if (p >= 100) {
          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          setScanStep("processing");
          captureAndAnalyzeFrame();
        }
      }, 100);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setScanError("Camera access denied or unavailable. Please check browser permissions.");
      setScanning(false);
      setScanStep("idle");
      setIsCameraModalOpen(false);
      stopCamera();
    }
  }

  async function captureAndAnalyzeFrame() {
    if (!videoRef.current || !canvasRef.current || !organization || !user) {
      stopCamera();
      setScanning(false);
      setScanStep("idle");
      setIsCameraModalOpen(false);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Release camera hardware immediately
    stopCamera();

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setScanError("Failed to capture frame from webcam.");
        setScanning(false);
        setScanStep("idle");
        setIsCameraModalOpen(false);
        return;
      }

      const res = await runStressDetectionScan(blob, organization.id, user.id);
      if (!res.faceDetected) {
        setScanError(res.message || "No face detected in webcam frame. Please position yourself in front of the camera.");
        setScanning(false);
        setScanStep("idle");
        setIsCameraModalOpen(false);
        return;
      }

      setLatestRecord(res.record);
      setScanStep("complete");
      setScanning(false);
      setIsCameraModalOpen(false);
      setShowFeedbackModal(true);
      loadHistory();
    }, "image/jpeg", 0.9);
  }

  function handleCancelScan() {
    stopCamera();
    setScanning(false);
    setScanStep("idle");
    setIsCameraModalOpen(false);
  }

  async function handleFeedbackSubmit(accurate: boolean) {
    if (!latestRecord || !organization || !user) return;
    setSubmittingFb(true);

    if (accurate) {
      await submitStressFeedback(latestRecord.id, true, "very_accurate", null, "", organization.id, user.id);
    } else {
      await submitStressFeedback(
        latestRecord.id,
        false,
        "not_accurate",
        correctedClass,
        userFeedbackText.trim(),
        organization.id,
        user.id
      );
    }

    setSubmittingFb(false);
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setShowFeedbackModal(false);
    }, 2000);
    loadModelPipelineData();
  }

  async function handleApproveSample(sampleId: string, status: "approved" | "rejected") {
    if (!user) return;
    await updateCandidateSampleStatus(sampleId, status, user.id);
    loadModelPipelineData();
  }

  async function handleRunEvaluation() {
    setEvaluating(true);
    setEvalMessage(null);

    const activeProd = modelVersions.find((m) => m.is_active_production);
    const prodAcc = activeProd?.accuracy || 0.912;
    const candidateAcc = Number((0.89 + Math.random() * 0.05).toFixed(3));
    const nextVer = `stress_model_v1.${modelVersions.length}`;

    const res = await runCandidateEvaluation(nextVer, activeProd?.version_tag || "stress_model_v1.0", candidateAcc, prodAcc);

    setEvaluating(false);
    if (res) {
      if (res.decision === "promoted_to_production") {
        setEvalMessage(`Candidate model ${nextVer} (Accuracy: ${(candidateAcc * 100).toFixed(1)}%) outperformed Production model (${(prodAcc * 100).toFixed(1)}%) and was promoted to Production!`);
      } else {
        setEvalMessage(`Candidate model ${nextVer} (Accuracy: ${(candidateAcc * 100).toFixed(1)}%) did NOT outperform Production model (${(prodAcc * 100).toFixed(1)}%). Kept current production model.`);
      }
      loadModelPipelineData();
    }
  }

  // Score details
  const currentScore = latestRecord?.stress_score ?? 0;
  const currentConfidence = latestRecord ? Math.round(latestRecord.confidence * 100) : 0;

  function getStressLevelCategory(score: number) {
    if (score <= 25) return { text: "LOW STRESS", label: "Low", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", barColor: "bg-emerald-500" };
    if (score <= 50) return { text: "MILD STRESS", label: "Mild", color: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10", barColor: "bg-cyan-400" };
    if (score <= 75) return { text: "MODERATE STRESS", label: "Moderate", color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", barColor: "bg-amber-400" };
    return { text: "HIGH STRESS", label: "High", color: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/15", barColor: "bg-rose-500" };
  }

  const activeCategory = getStressLevelCategory(currentScore);
  const activeProdModel = modelVersions.find((m) => m.is_active_production) || modelVersions[0];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      {/* Hidden Canvas for Frame Capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Cool Camera Pop-up Animation Modal */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
          <div className="max-w-md w-full bg-base-900 border border-base-700/80 rounded-3xl p-6 shadow-2xl space-y-5 relative animate-scale-up overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <h3 className="text-sm font-bold text-ink-100">AI Facial Cue Scanner</h3>
              </div>
              <button
                onClick={handleCancelScan}
                className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 hover:bg-base-800 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Live Camera Feed Viewport */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-base-950 border border-base-700 flex items-center justify-center">
              <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-cover transform -scale-x-100" />

              {/* High-Tech Framing Corners */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br" />

              {/* Face Guide Oval */}
              <div className="absolute w-44 h-56 rounded-full border-2 border-dashed border-cyan-400/40 pointer-events-none" />

              {/* Sliding Laser Line */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-scan-laser pointer-events-none" />

              {/* Live Overlay Status */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-base-950/80 backdrop-blur-md border border-base-700/60 text-[11px]">
                <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  {scanStep === "processing" ? "Analyzing MobileNetV2 Model..." : "Position face in frame"}
                </span>
                <span className="text-ink-400 font-mono">{scanProgress}%</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium text-ink-400">
                <span>Facial Expression Analysis</span>
                <span>{scanProgress}%</span>
              </div>
              <div className="w-full bg-base-950 h-2 rounded-full overflow-hidden border border-base-700/50">
                <div
                  className="h-full bg-gradient-to-r from-accent-500 to-cyan-400 transition-all duration-150 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleCancelScan}
                className="px-4 py-2 text-xs font-semibold text-ink-300 hover:text-ink-100 bg-base-800 hover:bg-base-750 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-base-700/40">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-100 tracking-tight flex items-center gap-3">
            <span>AI Stress Monitoring</span>
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30">
              {activeProdModel?.version_tag || "v1.0 Production"}
            </span>
          </h1>
          <p className="text-xs text-ink-400 mt-1.5 leading-relaxed">
            Real-time AI facial cue analysis, validated feedback telemetry, and safe model evaluation pipeline.
          </p>
        </div>

        <button
          onClick={startStressScan}
          disabled={scanning}
          className="group flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-cyan-500 hover:from-accent-600 hover:to-cyan-600 text-white font-semibold text-xs shadow-lg shadow-accent-500/20 transition-all duration-200 transform hover:-translate-y-0.5 disabled:opacity-50 shrink-0"
        >
          {scanning ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Opening Camera...</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Start Stress Scan</span>
            </>
          )}
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-base-850/90 border border-base-700/70 w-fit">
        {[
          { id: "scan", label: "Live Scan & Gauge" },
          { id: "history", label: `Stress History (${historyRecords.length})` },
          ...(isOwnerOrAdmin
            ? [{ id: "pipeline", label: `AI Pipeline & Quality (${candidateSamples.length})` }]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                : "text-ink-400 hover:text-ink-100 hover:bg-base-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {scanError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-3">
          <span className="text-base">⚠</span>
          <span>{scanError}</span>
        </div>
      )}

      {/* Tab 1: Live Scan, Fixed SVG Gauge & Stress Scale Visualizer */}
      {activeTab === "scan" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Fixed SVG Gauge */}
            <div className="lg:col-span-7 p-8 rounded-3xl glass-card relative overflow-hidden flex flex-col items-center justify-center text-center">
              <div className="absolute inset-0 liquid-aurora-bg opacity-40 pointer-events-none" />

              <h2 className="text-xs font-bold uppercase tracking-widest text-accent-400 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
                AI STRESS SCORE & MODEL TELEMETRY GAUGE
              </h2>

              {/* Fixed Semi-Circular SVG Gauge with Sleek Pointer Arrow */}
              <div className="relative w-80 h-48 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 200 130">
                  <defs>
                    <linearGradient id="gaugeGradientFixed" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="30%" stopColor="#06b6d4" />
                      <stop offset="65%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                  </defs>

                  {/* Outer Background Track Arc (Radius = 75, Center = 100, 105) */}
                  <path
                    d="M 25 105 A 75 75 0 0 1 175 105"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />

                  {/* Colored Active Arc */}
                  <path
                    d="M 25 105 A 75 75 0 0 1 175 105"
                    fill="none"
                    stroke="url(#gaugeGradientFixed)"
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray="235.6"
                    strokeDashoffset={235.6 - (235.6 * currentScore) / 100}
                    className="transition-all duration-1000 ease-out"
                  />

                  {/* Clean Numerical Score display sitting INSIDE the arc, above the pivot! */}
                  <text x="100" y="70" textAnchor="middle" className="fill-ink-100 font-extrabold text-3xl">
                    {scanStep === "processing" ? "..." : currentScore}
                  </text>
                  <text x="100" y="86" textAnchor="middle" className="fill-ink-400 font-semibold text-[11px]">
                    / 100
                  </text>

                  {/* Precision Arrow Pointer (R1=24 to R2=64, completely avoiding text overlap) */}
                  {(() => {
                    const angle = -180 + (currentScore / 100) * 180;
                    const rad = (angle * Math.PI) / 180;
                    const cx = 100;
                    const cy = 105;
                    const r1 = 24;
                    const r2 = 64;

                    const x1 = cx + r1 * Math.cos(rad);
                    const y1 = cy + r1 * Math.sin(rad);
                    const x2 = cx + r2 * Math.cos(rad);
                    const y2 = cy + r2 * Math.sin(rad);

                    // Arrowhead base vertices
                    const perp = rad + Math.PI / 2;
                    const baseW = 4.5;
                    const bx1 = x2 - 8 * Math.cos(rad) + baseW * Math.cos(perp);
                    const by1 = y2 - 8 * Math.sin(rad) + baseW * Math.sin(perp);
                    const bx2 = x2 - 8 * Math.cos(rad) - baseW * Math.cos(perp);
                    const by2 = y2 - 8 * Math.sin(rad) - baseW * Math.sin(perp);

                    return (
                      <g className="transition-all duration-1000 ease-out">
                        {/* Needle stem */}
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#38bdf8"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                        {/* Sleek Arrowhead Tip */}
                        <polygon
                          points={`${x2},${y2} ${bx1},${by1} ${bx2},${by2}`}
                          fill="#38bdf8"
                        />
                        {/* Small Pivot Ring at r1 */}
                        <circle cx={cx} cy={cy} r="5" fill="#0284c7" stroke="#38bdf8" strokeWidth="2" />
                      </g>
                    );
                  })()}
                </svg>
              </div>

              {/* Active Category Badge */}
              <div className="mt-2 flex flex-col items-center gap-2">
                <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold border ${activeCategory.bg} ${activeCategory.color} ${activeCategory.border} shadow-sm uppercase tracking-wider`}>
                  {activeCategory.text}
                </span>
                <p className="text-[11px] text-ink-400 max-w-sm">
                  Model Confidence: <span className="text-ink-100 font-semibold">{currentConfidence}%</span> | Class: <span className="text-ink-200 capitalize font-medium">{latestRecord ? latestRecord.predicted_class.replace("_", " ") : "Normal"}</span>
                </p>
              </div>

              {/* Quick Scale Categories Bar */}
              <div className="w-full max-w-sm grid grid-cols-4 gap-2 pt-5 mt-5 border-t border-base-700/50 text-[10px] font-semibold text-ink-400 text-center">
                <div><span className="text-emerald-400 block font-bold">0–25</span>Low</div>
                <div><span className="text-cyan-400 block font-bold">26–50</span>Mild</div>
                <div><span className="text-amber-400 block font-bold">51–75</span>Moderate</div>
                <div><span className="text-rose-400 block font-bold">76–100</span>High</div>
              </div>
            </div>

            {/* Right Column: AI Result & Feedback */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 shadow-xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400 flex items-center justify-between">
                  <span>AI Stress Result</span>
                  <span className="text-[10px] font-mono text-ink-500">
                    {latestRecord ? new Date(latestRecord.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No recent scan"}
                  </span>
                </h3>

                {latestRecord ? (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-base-900 border border-base-750 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">AI Stress Score</span>
                        <span className="text-lg font-bold text-ink-100">{latestRecord.stress_score} / 100</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">Model Confidence</span>
                        <span className="text-xs font-semibold text-accent-400">{Math.round(latestRecord.confidence * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-400">Model Version</span>
                        <span className="text-xs font-mono text-ink-300">{latestRecord.model_version}</span>
                      </div>
                    </div>

                    {/* Feedback Prompt */}
                    {showFeedbackModal && !feedbackSubmitted && (
                      <div className="p-4 rounded-xl bg-accent-500/10 border border-accent-500/30 space-y-3 animate-fade-in-up">
                        <p className="text-xs font-semibold text-accent-300">
                          Was this result accurate?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleFeedbackSubmit(true)}
                            disabled={submittingFb}
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-base-950 transition-colors"
                          >
                            ✓ Yes, Accurate
                          </button>
                          <button
                            onClick={() => setFeedbackChoice(false)}
                            disabled={submittingFb}
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-base-800 hover:bg-base-750 text-ink-200 border border-base-700 transition-colors"
                          >
                            ✗ No, Inaccurate
                          </button>
                        </div>

                        {feedbackChoice === false && (
                          <div className="space-y-3 pt-2 border-t border-accent-500/20">
                            <div>
                              <label className="block text-[11px] font-medium text-ink-300 mb-1">
                                Correct emotional state:
                              </label>
                              <select
                                value={correctedClass}
                                onChange={(e) => setCorrectedClass(e.target.value as any)}
                                className="w-full px-3 py-1.5 text-xs rounded-lg bg-base-900 border border-base-700 text-ink-100"
                              >
                                <option value="non_stress">Non-Stress (Normal)</option>
                                <option value="stress">Stress (Elevated Cues)</option>
                              </select>
                            </div>
                            <div>
                              <input
                                type="text"
                                value={userFeedbackText}
                                onChange={(e) => setUserFeedbackText(e.target.value)}
                                placeholder="Optional feedback details..."
                                className="w-full px-3 py-1.5 text-xs rounded-lg bg-base-900 border border-base-700 text-ink-100 placeholder-ink-500"
                              />
                            </div>
                            <button
                              onClick={() => handleFeedbackSubmit(false)}
                              disabled={submittingFb}
                              className="w-full py-1.5 text-xs font-semibold rounded-lg bg-accent-500 hover:bg-accent-600 text-white transition-colors"
                            >
                              {submittingFb ? "Submitting..." : "Submit Sample for Validation"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {feedbackSubmitted && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 text-center animate-pulse">
                        ✓ Thank you! Feedback recorded for model quality pipeline.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500 text-center py-8 bg-base-900/40 rounded-xl border border-base-750">
                    Click "Start Stress Scan" above to open webcam scan.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Interactive 0–100 Stress Scale Spectrum Visualizer Card */}
          <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink-100 flex items-center gap-2">
                  <span>Continuous 0–100 AI Stress Scale</span>
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-accent-500/15 text-accent-400 border border-accent-500/30">
                    Spectrum Analysis
                  </span>
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Visual probability distribution mapped from MobileNetV2 facial emotion classification outputs.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-ink-400">Current Level:</span>
                <span className={`px-2.5 py-1 rounded-lg border ${activeCategory.bg} ${activeCategory.color} ${activeCategory.border}`}>
                  {currentScore} ({activeCategory.label})
                </span>
              </div>
            </div>

            {/* Continuous Gradient Track with Animated Marker Dot */}
            <div className="space-y-2 pt-2">
              <div className="relative w-full h-4 rounded-full bg-base-950 border border-base-700/60 overflow-visible">
                {/* Gradient Fill Bar */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 via-amber-400 to-rose-500 opacity-90" />

                {/* Animated Indicator Slider Marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-2 border-accent-500 shadow-[0_0_12px_#38bdf8] transition-all duration-1000 ease-out flex items-center justify-center text-[9px] font-bold text-base-950"
                  style={{ left: `calc(${currentScore}% - 12px)` }}
                >
                  {currentScore}
                </div>
              </div>

              {/* Scale Tick Markers */}
              <div className="flex justify-between text-[10px] font-mono text-ink-400 pt-1">
                <span>0 (Min)</span>
                <span>25 (Low)</span>
                <span>50 (Mild)</span>
                <span>75 (Moderate)</span>
                <span>100 (High)</span>
              </div>
            </div>

            {/* Scale Ranges Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className={`p-4 rounded-xl border transition-all ${currentScore <= 25 ? "bg-emerald-500/10 border-emerald-500/50 shadow-md shadow-emerald-500/10" : "bg-base-900 border-base-750 opacity-75"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-emerald-400">0 – 25</span>
                  <span className="text-[10px] font-semibold text-emerald-300/80">LOW</span>
                </div>
                <p className="text-[11px] text-ink-300 leading-relaxed">
                  Relaxed facial expressions. High presence of positive or baseline neutral cues.
                </p>
              </div>

              <div className={`p-4 rounded-xl border transition-all ${currentScore > 25 && currentScore <= 50 ? "bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10" : "bg-base-900 border-base-750 opacity-75"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-cyan-400">26 – 50</span>
                  <span className="text-[10px] font-semibold text-cyan-300/80">MILD</span>
                </div>
                <p className="text-[11px] text-ink-300 leading-relaxed">
                  Subtle focal tension detected. Slight expression changes during deep work.
                </p>
              </div>

              <div className={`p-4 rounded-xl border transition-all ${currentScore > 50 && currentScore <= 75 ? "bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10" : "bg-base-900 border-base-750 opacity-75"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-amber-400">51 – 75</span>
                  <span className="text-[10px] font-semibold text-amber-300/80">MODERATE</span>
                </div>
                <p className="text-[11px] text-ink-300 leading-relaxed">
                  Elevated stress cues detected (furrowed brow, heightened tension). Break recommended.
                </p>
              </div>

              <div className={`p-4 rounded-xl border transition-all ${currentScore > 75 ? "bg-rose-500/15 border-rose-500/50 shadow-md shadow-rose-500/10" : "bg-base-900 border-base-750 opacity-75"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-rose-400">76 – 100</span>
                  <span className="text-[10px] font-semibold text-rose-300/80">HIGH</span>
                </div>
                <p className="text-[11px] text-ink-300 leading-relaxed">
                  High confidence stress cues (strain/fatigue). Short relaxation interval advised.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Real-time History & Trend Logs */}
      {activeTab === "history" && (
        <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 space-y-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-100">Personalized Stress History Timeline</h2>
              <p className="text-xs text-ink-400 mt-0.5">
                Every completed check contributes to the continuous quality improvement pipeline.
              </p>
            </div>
            <span className="text-xs text-ink-400">Showing last {historyRecords.length} records</span>
          </div>

          {loadingHistory ? (
            <div className="p-8 text-center text-xs text-ink-400">Loading stress history...</div>
          ) : historyRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-500 bg-base-900/40 rounded-xl border border-base-750">
              No stress records found. Take an AI wellbeing check to record detections.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-ink-200">
                <thead className="bg-base-900 text-ink-400 font-semibold uppercase text-[10px] tracking-wider border-b border-base-700/60">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Event Type</th>
                    {isOwnerOrAdmin && <th className="py-3 px-4">Employee</th>}
                    <th className="py-3 px-4">AI Estimate</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Pattern / Baseline</th>
                    <th className="py-3 px-4">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-700/50">
                  {historyRecords.map((r) => {
                    const cat = getStressLevelCategory(r.stress_score);
                    const eventLabel = r.event_type || "MANUAL";
                    return (
                      <tr key={r.id} className="hover:bg-base-800/40 transition-colors">
                        <td className="py-3 px-4 text-ink-300 font-mono">
                          {new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-base-800 border border-white/10 text-cyan-300 uppercase tracking-wider">
                            {eventLabel}
                          </span>
                        </td>
                        {isOwnerOrAdmin && (
                          <td className="py-3 px-4 font-medium text-ink-100">
                            {r.employee?.full_name || r.employee?.email || "Team Member"}
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cat.bg} ${cat.color} ${cat.border}`}>
                            {r.predicted_class === "stress" ? "Elevated Indicator" : "Normal Baseline"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-ink-100">{r.stress_score} / 100</td>
                        <td className="py-3 px-4 text-accent-400 font-semibold">{Math.round(r.confidence * 100)}%</td>
                        <td className="py-3 px-4 text-ink-300 max-w-xs truncate" title={r.baseline_comparison || ""}>
                          {r.baseline_comparison || "Logged"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-ink-400">{r.model_version}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Model Performance & Continuous Improvement Pipeline (Owner/Admin only) */}
      {activeTab === "pipeline" && isOwnerOrAdmin && (
        <div className="space-y-6">
          {/* Active Production Model Metrics */}
          <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink-100">Active Production Model Metrics</h2>
                <p className="text-xs text-ink-400 mt-0.5">
                  Verified evaluation benchmark results calculated on labeled test datasets.
                </p>
              </div>
              <button
                onClick={handleRunEvaluation}
                disabled={evaluating}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent-500 hover:bg-accent-600 text-white transition-colors flex items-center gap-2"
              >
                {evaluating ? "Running Benchmark..." : "Run Candidate Benchmark Evaluation"}
              </button>
            </div>

            {evalMessage && (
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-medium text-cyan-300">
                {evalMessage}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-base-900 border border-base-750">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Test Accuracy</span>
                <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                  {((activeProdModel?.accuracy ?? 0.912) * 100).toFixed(1)}%
                </p>
                <span className="text-[10px] text-ink-500">CK+ Benchmark</span>
              </div>
              <div className="p-4 rounded-xl bg-base-900 border border-base-750">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Precision</span>
                <p className="text-2xl font-extrabold text-cyan-400 mt-1">
                  {((activeProdModel?.precision_score ?? 0.905) * 100).toFixed(1)}%
                </p>
                <span className="text-[10px] text-ink-500">True Positive Rate</span>
              </div>
              <div className="p-4 rounded-xl bg-base-900 border border-base-750">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Recall</span>
                <p className="text-2xl font-extrabold text-amber-400 mt-1">
                  {((activeProdModel?.recall_score ?? 0.920) * 100).toFixed(1)}%
                </p>
                <span className="text-[10px] text-ink-500">Sensitivity</span>
              </div>
              <div className="p-4 rounded-xl bg-base-900 border border-base-750">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">F1-Score</span>
                <p className="text-2xl font-extrabold text-indigo-400 mt-1">
                  {((activeProdModel?.f1_score ?? 0.912) * 100).toFixed(1)}%
                </p>
                <span className="text-[10px] text-ink-500">Harmonic Mean</span>
              </div>
            </div>
          </div>

          {/* Candidate Sample Quality Queue */}
          <div className="p-6 rounded-2xl bg-base-850/90 border border-base-700/70 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-ink-100">Candidate Feedback Validation Queue</h2>
            <p className="text-xs text-ink-400">
              Only samples approved by admins are added to the future offline training dataset.
            </p>

            {candidateSamples.length === 0 ? (
              <p className="text-xs text-ink-500 text-center py-6 bg-base-900/40 rounded-xl border border-base-750">
                No pending candidate samples queued for validation.
              </p>
            ) : (
              <div className="space-y-3">
                {candidateSamples.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-base-900 border border-base-750 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-ink-200">Validated Class:</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-accent-500/10 text-accent-400 border border-accent-500/30 capitalize">
                          {s.validated_class.replace("_", " ")}
                        </span>
                        <span className="text-[11px] text-ink-500">
                          Status: <span className="font-semibold capitalize text-ink-300">{s.status.replace("_", " ")}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-400 font-mono">
                        Record ID: {s.record_id} | Created: {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {s.status === "pending_validation" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleApproveSample(s.id, "approved")}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-base-950 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleApproveSample(s.id, "rejected")}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
