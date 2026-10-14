Drop the converted liveness model here (model.json + shard .bin files).

Convert from the Python prototype (in the venv where it was trained):
  pip install tensorflowjs
  tensorflowjs_converter --input_format keras models/liveness_model.h5 public/models/liveness

Until this exists, faceAuth.spoofProbability() returns null and the "hold
still" verification step in FaceLivenessCapture still completes (face_verified
recorded as false) but without an actual spoof/liveness check -- fine for
testing the new guided-capture flow, not for production. Re-run the converter
after retraining.

The guided capture (src/components/FaceLivenessCapture.tsx) now also runs a
motion-based liveness challenge before this model even gets a frame: it makes
the employee center their face, turn their head one way, then the other way,
before it starts sampling with the CNN model -- a photo/video-replay attack
has to fool both checks now.
