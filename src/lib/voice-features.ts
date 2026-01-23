/**
 * Voice Feature Extraction and Speaker Identification
 *
 * This module provides utilities for extracting audio features from voice samples
 * and comparing them for speaker identification. Uses MFCC-like features computed
 * from the Web Audio API's AnalyserNode.
 */

export interface VoiceFeatures {
  mfccMeans: number[];
  mfccVariances: number[];
  pitchMean: number;
  pitchVariance: number;
  energyMean: number;
  energyVariance: number;
  spectralCentroidMean: number;
  zeroCrossingRate: number;
}

export interface VoiceProfile {
  features: VoiceFeatures;
  samplesCount: number;
  threshold: number;
}

const FFT_SIZE = 2048;
const NUM_MEL_BANDS = 13;

/**
 * Extract voice features from an audio blob
 */
export async function extractVoiceFeatures(audioBlob: Blob): Promise<VoiceFeatures> {
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Extract features
  const mfccFeatures = computeMFCCLikeFeatures(channelData, sampleRate);
  const pitchFeatures = computePitchFeatures(channelData, sampleRate);
  const energyFeatures = computeEnergyFeatures(channelData);
  const spectralCentroid = computeSpectralCentroid(channelData, sampleRate);
  const zeroCrossingRate = computeZeroCrossingRate(channelData);

  await audioContext.close();

  return {
    mfccMeans: mfccFeatures.means,
    mfccVariances: mfccFeatures.variances,
    pitchMean: pitchFeatures.mean,
    pitchVariance: pitchFeatures.variance,
    energyMean: energyFeatures.mean,
    energyVariance: energyFeatures.variance,
    spectralCentroidMean: spectralCentroid,
    zeroCrossingRate,
  };
}

/**
 * Compute MFCC-like features using FFT bands
 */
function computeMFCCLikeFeatures(
  samples: Float32Array,
  sampleRate: number
): { means: number[]; variances: number[] } {
  const frameSize = FFT_SIZE;
  const hopSize = frameSize / 2;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  if (numFrames <= 0) {
    return {
      means: new Array(NUM_MEL_BANDS).fill(0),
      variances: new Array(NUM_MEL_BANDS).fill(0),
    };
  }

  const melBandEnergies: number[][] = Array.from(
    { length: NUM_MEL_BANDS },
    () => []
  );

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const frame = samples.slice(start, start + frameSize);

    // Apply Hamming window
    const windowed = applyHammingWindow(frame);

    // Compute FFT magnitude
    const fftMagnitude = computeFFTMagnitude(windowed);

    // Compute mel band energies
    const melEnergies = computeMelBandEnergies(fftMagnitude, sampleRate);

    for (let j = 0; j < NUM_MEL_BANDS; j++) {
      melBandEnergies[j].push(melEnergies[j]);
    }
  }

  // Compute means and variances for each band
  const means = melBandEnergies.map((band) => mean(band));
  const variances = melBandEnergies.map((band) => variance(band));

  return { means, variances };
}

/**
 * Compute pitch features using autocorrelation
 */
function computePitchFeatures(
  samples: Float32Array,
  sampleRate: number
): { mean: number; variance: number } {
  const frameSize = 2048;
  const hopSize = 1024;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  if (numFrames <= 0) {
    return { mean: 0, variance: 0 };
  }

  const pitches: number[] = [];

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const frame = samples.slice(start, start + frameSize);

    const pitch = estimatePitch(frame, sampleRate);
    if (pitch > 50 && pitch < 500) {
      // Valid voice pitch range
      pitches.push(pitch);
    }
  }

  if (pitches.length === 0) {
    return { mean: 0, variance: 0 };
  }

  return {
    mean: mean(pitches),
    variance: variance(pitches),
  };
}

/**
 * Estimate pitch using autocorrelation
 */
function estimatePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 500); // Max 500Hz
  const maxLag = Math.floor(sampleRate / 50); // Min 50Hz

  let maxCorr = -1;
  let bestLag = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < frame.length - lag; i++) {
      corr += frame[i] * frame[i + lag];
    }

    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}

/**
 * Compute energy features
 */
function computeEnergyFeatures(
  samples: Float32Array
): { mean: number; variance: number } {
  const frameSize = 1024;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  if (numFrames <= 0) {
    return { mean: 0, variance: 0 };
  }

  const energies: number[] = [];

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    const frame = samples.slice(start, start + frameSize);

    let energy = 0;
    for (let j = 0; j < frame.length; j++) {
      energy += frame[j] * frame[j];
    }
    energies.push(Math.sqrt(energy / frame.length));
  }

  return {
    mean: mean(energies),
    variance: variance(energies),
  };
}

/**
 * Compute spectral centroid
 */
function computeSpectralCentroid(
  samples: Float32Array,
  sampleRate: number
): number {
  const fftMagnitude = computeFFTMagnitude(applyHammingWindow(samples.slice(0, FFT_SIZE)));

  let weightedSum = 0;
  let totalMagnitude = 0;

  for (let i = 0; i < fftMagnitude.length; i++) {
    const frequency = (i * sampleRate) / (fftMagnitude.length * 2);
    weightedSum += frequency * fftMagnitude[i];
    totalMagnitude += fftMagnitude[i];
  }

  return totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
}

/**
 * Compute zero crossing rate
 */
function computeZeroCrossingRate(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / samples.length;
}

/**
 * Apply Hamming window to a frame
 */
function applyHammingWindow(frame: Float32Array): Float32Array {
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const multiplier = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
    windowed[i] = frame[i] * multiplier;
  }
  return windowed;
}

/**
 * Compute FFT magnitude (simplified DFT for small sizes)
 */
function computeFFTMagnitude(samples: Float32Array): Float32Array {
  const n = samples.length;
  const magnitude = new Float32Array(n / 2);

  for (let k = 0; k < n / 2; k++) {
    let real = 0;
    let imag = 0;

    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      real += samples[t] * Math.cos(angle);
      imag -= samples[t] * Math.sin(angle);
    }

    magnitude[k] = Math.sqrt(real * real + imag * imag);
  }

  return magnitude;
}

/**
 * Compute mel band energies
 */
function computeMelBandEnergies(fftMagnitude: Float32Array, sampleRate: number): number[] {
  const melEnergies = new Array(NUM_MEL_BANDS).fill(0);
  const nyquist = sampleRate / 2;
  const binFrequencyStep = nyquist / fftMagnitude.length;

  // Define mel filter bank boundaries
  const melMin = hzToMel(20);
  const melMax = hzToMel(nyquist);
  const melStep = (melMax - melMin) / (NUM_MEL_BANDS + 1);

  for (let band = 0; band < NUM_MEL_BANDS; band++) {
    const melLow = melMin + band * melStep;
    const melCenter = melMin + (band + 1) * melStep;
    const melHigh = melMin + (band + 2) * melStep;

    const hzLow = melToHz(melLow);
    const hzCenter = melToHz(melCenter);
    const hzHigh = melToHz(melHigh);

    let energy = 0;
    for (let bin = 0; bin < fftMagnitude.length; bin++) {
      const frequency = bin * binFrequencyStep;

      let weight = 0;
      if (frequency >= hzLow && frequency < hzCenter) {
        weight = (frequency - hzLow) / (hzCenter - hzLow);
      } else if (frequency >= hzCenter && frequency < hzHigh) {
        weight = (hzHigh - frequency) / (hzHigh - hzCenter);
      }

      energy += fftMagnitude[bin] * weight;
    }

    melEnergies[band] = Math.log(energy + 1e-10);
  }

  return melEnergies;
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
}

/**
 * Combine multiple voice feature samples into a profile
 */
export function createVoiceProfile(featuresList: VoiceFeatures[]): VoiceProfile {
  if (featuresList.length === 0) {
    throw new Error('At least one voice sample is required');
  }

  // Average all features
  const avgFeatures: VoiceFeatures = {
    mfccMeans: featuresList[0].mfccMeans.map((_, i) =>
      mean(featuresList.map((f) => f.mfccMeans[i]))
    ),
    mfccVariances: featuresList[0].mfccVariances.map((_, i) =>
      mean(featuresList.map((f) => f.mfccVariances[i]))
    ),
    pitchMean: mean(featuresList.map((f) => f.pitchMean)),
    pitchVariance: mean(featuresList.map((f) => f.pitchVariance)),
    energyMean: mean(featuresList.map((f) => f.energyMean)),
    energyVariance: mean(featuresList.map((f) => f.energyVariance)),
    spectralCentroidMean: mean(featuresList.map((f) => f.spectralCentroidMean)),
    zeroCrossingRate: mean(featuresList.map((f) => f.zeroCrossingRate)),
  };

  // Calculate threshold based on variance in samples
  const distances = featuresList.map((f) => computeFeatureDistance(f, avgFeatures));
  const maxDistance = Math.max(...distances);
  const threshold = maxDistance * 1.5 + 0.1; // Add margin for variation

  return {
    features: avgFeatures,
    samplesCount: featuresList.length,
    threshold,
  };
}

/**
 * Compute distance between two voice feature sets
 */
export function computeFeatureDistance(a: VoiceFeatures, b: VoiceFeatures): number {
  let distance = 0;

  // MFCC distance (weighted heavily)
  for (let i = 0; i < a.mfccMeans.length; i++) {
    distance += Math.pow(a.mfccMeans[i] - b.mfccMeans[i], 2) * 2;
    distance += Math.pow(a.mfccVariances[i] - b.mfccVariances[i], 2);
  }

  // Pitch distance
  const pitchScale = 100;
  distance += Math.pow((a.pitchMean - b.pitchMean) / pitchScale, 2) * 3;
  distance += Math.pow((a.pitchVariance - b.pitchVariance) / pitchScale, 2);

  // Energy distance
  distance += Math.pow(a.energyMean - b.energyMean, 2) * 2;
  distance += Math.pow(a.energyVariance - b.energyVariance, 2);

  // Spectral centroid distance
  const centroidScale = 1000;
  distance += Math.pow((a.spectralCentroidMean - b.spectralCentroidMean) / centroidScale, 2);

  // Zero crossing rate distance
  distance += Math.pow(a.zeroCrossingRate - b.zeroCrossingRate, 2) * 0.5;

  return Math.sqrt(distance);
}

/**
 * Check if voice features match a profile
 */
export function matchesVoiceProfile(
  features: VoiceFeatures,
  profile: VoiceProfile
): { matches: boolean; confidence: number; distance: number } {
  const distance = computeFeatureDistance(features, profile.features);
  const matches = distance <= profile.threshold;

  // Confidence is inversely proportional to distance
  // At threshold distance, confidence is ~50%
  // At zero distance, confidence is 100%
  const normalizedDistance = distance / profile.threshold;
  const confidence = Math.max(0, Math.min(1, 1 - normalizedDistance * 0.5));

  return { matches, confidence, distance };
}

/**
 * Serialize voice profile to JSON string
 */
export function serializeVoiceProfile(profile: VoiceProfile): string {
  return JSON.stringify(profile);
}

/**
 * Deserialize voice profile from JSON string
 */
export function deserializeVoiceProfile(json: string): VoiceProfile {
  return JSON.parse(json) as VoiceProfile;
}
