# FaceScan

FaceScan is a fully offline-first, high-performance face recognition mobile application designed for secure local authentication. The app performs all image capture, preprocessing, and model inference entirely on-device, ensuring zero server-side latency and maximum privacy. It is optimized for mobile deployment on Android devices using Capacitor.

## Tech Stack

- **Core Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 (optimized with modern CSS variables and transitions)
- **Native Wrapper**: Capacitor (Android APK deployment)
- **Machine Learning**: TensorFlow.js + Teachable Machine (`@teachablemachine/image` + `@tensorflow/tfjs` running fully locally)
- **Native Plugins**: `@capacitor/camera` (local capture) and `@capacitor/preferences` (fully local, persistent history logs)

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Add Local Model Files**:
   Ensure your local Teachable Machine model files are located inside the `public/model/` directory. You must include these three files:
   - `model.json`
   - `weights.bin`
   - `metadata.json`

3. **Configure Persons Database**:
   Update `src/data/persons.json` with the exact Teachable Machine class labels, full names, and student IDs for the individuals trained in your model.

4. **Run Development Server**:
   ```bash
   npm run dev
   ```

## APK Build Instructions

We have established an automated GitHub Actions CI/CD pipeline to compile debug APK binaries:
1. **Push Code**: Commit your changes and push to the `main` branch of your repository.
2. **CI Pipeline**: The pipeline will trigger automatically, set up the build environment, sync plugins, and compile the Android project using Gradle.
3. **Download Binary**: Go to the **Actions** tab of your repository on GitHub, click on the latest workflow run, and download the `facescan-debug.apk` artifact.

## Model Notes

- **Classes**: The underlying local classifier is trained on **30 person classes** and **1 environment class** (for no-face classification).
- **Aspect Preprocessing**: Every camera snapshot or custom upload undergoes standard 224×224 1:1 square center-crop rescaling before passing to TensorFlow.js to prevent image distortion and retain high matching confidence.
- **Confidence Thresholds**:
  - `Match Success`: $\ge 75\%$ confidence (State A)
  - `Low Confidence Match`: $50\% - 74\%$ confidence (State B)
  - `No Person Detected`: $< 50\%$ confidence (State C)
