import io
import pandas as pd
import numpy as np
from scipy.signal import find_peaks
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler

# --- FastAPI App Initialization ---
app = FastAPI(
    title="SmartTrainer ML Microservice",
    description="Analyzes IMU data for exercise form and jerk detection.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, lock this to your Node server's IP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =======================================================
# CONFIGURATION: EXERCISE PARAMETERS
# =======================================================
EXERCISE_CONFIG = {
    "biceps_curl": {
        "name": "Biceps Curl (Supinated)",
        "TARGET_ROM": 90.0,
        "TARGET_TIME": 2.5,
        "MIN_PROMINENCE": 3,
        "MIN_ROM_VALID": 15,
    }
}

# Scoring weights
WEIGHT_ROM   = 0.50
WEIGHT_STAB  = 0.30
WEIGHT_TEMPO = 0.20

# Penalty applied to the stability score per rule-based flag
RULE_FLAG_PENALTY = 20.0

# One-Class SVM: fraction of reps expected to be outliers (tune 0.10–0.25)
OCSVM_NU = 0.15


# =======================================================
# LAYER 1 — RULE-BASED PER-REP FORM FLAGS
# These operate on each rep individually and are fully interpretable.
# =======================================================

def detect_rep_form_flags(df, rep, time, angle_smooth, avg_fs, target_rom):
    """
    Returns a list of string flags describing form issues in this rep.
    Each flag maps to a user-facing message on the frontend.

    Flags:
        jerk_spike       — sudden angular velocity spike (loss of control)
        asymmetric_tempo — curl-up / lower-down ratio is heavily imbalanced
        partial_rom      — less than 60% of the target ROM achieved
        instability      — high gyro variance relative to mean (shaky movement)
    """
    s, p, e = rep["start"], rep["peak"], rep["end"]
    flags = []

    gyro_segment = df["gyro_mag_rads"].iloc[s:e]
    gyro_mean = gyro_segment.mean()
    gyro_std  = gyro_segment.std()

    # --- Flag 1: Jerk spike ---
    # A spike is a sample where the frame-to-frame change in gyro magnitude
    # exceeds 2.5 standard deviations above the segment mean.
    gyro_jerk = gyro_segment.diff().abs()
    jerk_threshold = gyro_mean + 2 * gyro_std
    if (gyro_jerk > jerk_threshold).any():
        flags.append("jerk_spike")

    # --- Flag 2: Asymmetric tempo ---
    # For a controlled curl the peak should fall between 30–70% of the rep.
    # Outside that window = rushing up or collapsing down too fast.
    total_frames = e - s
    if total_frames > 0:
        peak_ratio = (p - s) / total_frames
        if peak_ratio < 0.30 or peak_ratio > 0.70:
            flags.append("asymmetric_tempo")

    # --- Flag 3: Partial ROM ---
    actual_rom = float(angle_smooth[p] - angle_smooth[s])
    if actual_rom < 0.5 * target_rom:
        flags.append("partial_rom")

    # --- Flag 4: Instability (shaky rep) ---
    # Coefficient of variation > 0.8 means the gyro is highly erratic
    # relative to its mean — indicative of trembling or losing control.
    cv = gyro_std / (gyro_mean + 1e-6)
    if cv > 0.8:
        flags.append("instability")

    return flags


# =======================================================
# LAYER 2 — IQR OUTLIER REP DETECTION
# Compares reps against each other within the same session.
# No training data required; adapts to the individual user.
# =======================================================

def detect_iqr_outlier_reps(rep_metrics):
    """
    Flags reps whose ROM or duration deviate significantly from the
    session median using the standard 1.5×IQR rule.

    Returns a set of 0-based rep indices that are statistical outliers.
    Requires at least 4 reps to produce meaningful statistics.
    """
    if len(rep_metrics) < 4:
        return set()

    outlier_indices = set()

    for metric_key in ["rom", "duration"]:
        values = np.array([r[metric_key] for r in rep_metrics])
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        for i, v in enumerate(values):
            if v < lower or v > upper:
                outlier_indices.add(i)

    return outlier_indices


# =======================================================
# LAYER 3 — ONE-CLASS SVM ON PER-REP FEATURE VECTORS
# Operates on one vector per rep, not per timestep 
# =======================================================

def detect_ocsvm_outlier_reps(rep_feature_matrix):
    """
    Fits a One-Class SVM on a (n_reps × n_features) matrix and returns
    a boolean array: True = outlier rep.

    Features per rep:
        rom, duration, gyro_mean, gyro_std, accel_cv, n_flags

    Falls back gracefully if there aren't enough reps to fit the model.
    """
    if len(rep_feature_matrix) < 4:
        return np.zeros(len(rep_feature_matrix), dtype=bool)

    X = np.array(rep_feature_matrix)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    clf = OneClassSVM(nu=OCSVM_NU, kernel="rbf", gamma="scale")
    clf.fit(X_scaled)
    predictions = clf.predict(X_scaled)  # -1 = outlier, 1 = normal

    return predictions == -1


# =======================================================
# SCORING ALGORITHM
# =======================================================

def analyze_reps(df, exercise_key):
    """
    Main analysis pipeline:
      1. Smooth the angle signal and segment into reps.
      2. Score each rep on ROM, stability (rule-based flags), and tempo.
      3. Run IQR + One-Class SVM outlier detection across reps.
      4. Return rep metrics and chart data for the frontend.
    """
    config = EXERCISE_CONFIG.get(exercise_key, EXERCISE_CONFIG["biceps_curl"])
    TARGET_ROM    = config["TARGET_ROM"]
    TARGET_TIME   = config["TARGET_TIME"]
    MIN_PROMINENCE = config["MIN_PROMINENCE"]
    MIN_ROM_VALID  = config["MIN_ROM_VALID"]

    angle_col = next((c for c in df.columns if "angle" in c.lower()), None)
    if not angle_col:
        raise ValueError("No angle column found in CSV.")

    time  = df["ms"] / 1000.0
    angle = df[angle_col]

    # --- Adaptive smoothing ---
    avg_fs = 1.0 / np.mean(np.diff(time))
    window_size = max(3, int(avg_fs * 0.5))
    angle_smooth = (
        angle.rolling(window=window_size, center=True)
             .mean()
             .bfill()
             .ffill()
    )

    # --- Rep segmentation ---
    peaks,   _ = find_peaks( angle_smooth, distance=1.0 * avg_fs, prominence=MIN_PROMINENCE)
    valleys, _ = find_peaks(-angle_smooth, distance=1.0 * avg_fs, prominence=MIN_PROMINENCE)

    reps = []
    for p_idx in peaks:
        before = valleys[valleys < p_idx]
        after  = valleys[valleys > p_idx]
        if len(before) > 0 and len(after) > 0:
            start_idx = before[-1]
            end_idx   = after[0]
            duration  = time[end_idx] - time[start_idx]
            rom_up    = angle_smooth[p_idx] - angle_smooth[start_idx]
            if 0.5 < duration < 8.0 and rom_up >= MIN_ROM_VALID:
                reps.append({
                    "start": int(start_idx),
                    "peak":  int(p_idx),
                    "end":   int(end_idx),
                })

    # --- Per-rep scoring (Layer 1 flags applied here) ---
    rep_metrics = []
    ocsvm_feature_rows = []

    for i, r in enumerate(reps):
        s, p, e = r["start"], r["peak"], r["end"]

        actual_rom = float(angle_smooth[p] - angle_smooth[s])
        actual_dur = float(time[e] - time[s])

        gyro_seg  = df["gyro_mag_rads"].iloc[s:e]
        accel_seg = df["accel_mag_g"].iloc[s:e]
        gyro_mean = float(gyro_seg.mean())
        gyro_std  = float(gyro_seg.std())
        accel_cv  = float(accel_seg.std() / (accel_seg.mean() + 1e-6))

        # Layer 1: rule-based form flags
        form_flags = detect_rep_form_flags(
            df, r, time, angle_smooth, avg_fs, TARGET_ROM
        )

        # Score components
        score_rom   = np.clip((actual_rom / TARGET_ROM) * 100, 0, 100)
        flag_penalty = len(form_flags) * RULE_FLAG_PENALTY
        score_stab  = max(0.0, 100.0 - flag_penalty)
        score_tempo = max(0.0, 100.0 - abs(actual_dur - TARGET_TIME) * 15.0)
        final_score = (
            WEIGHT_ROM   * score_rom  +
            WEIGHT_STAB  * score_stab +
            WEIGHT_TEMPO * score_tempo
        )

        rep_metrics.append({
            "rep_number": i + 1,
            "rom":        round(actual_rom, 1),
            "duration":   round(actual_dur, 1),
            "score":      round(final_score, 1),
            "form_flags": form_flags,          
            "is_iqr_outlier":  False,          
            "is_ml_outlier":   False,          
            "indexes": {"start": s, "peak": p, "end": e},
        })

        # Build feature vector for Layer 3
        ocsvm_feature_rows.append([
            actual_rom,
            actual_dur,
            gyro_mean,
            gyro_std,
            accel_cv,
            float(len(form_flags)),
        ])

    # --- Layer 2: IQR outlier reps ---
    iqr_outlier_indices = detect_iqr_outlier_reps(rep_metrics)
    for idx in iqr_outlier_indices:
        rep_metrics[idx]["is_iqr_outlier"] = True

    # --- Layer 3: One-Class SVM outlier reps ---
    ml_outlier_mask = detect_ocsvm_outlier_reps(ocsvm_feature_rows)
    for idx, is_outlier in enumerate(ml_outlier_mask):
        rep_metrics[idx]["is_ml_outlier"] = bool(is_outlier)

    # --- Chart data for the frontend ---
    chart_data = {
        "time":        time.tolist(),
        "angle_smooth": angle_smooth.tolist(),
        "gyro_mag":    df["gyro_mag_rads"].tolist(),
    }

    return rep_metrics, chart_data


# =======================================================
# API ROUTES
# =======================================================

@app.post("/api/analyze")
async def upload_file(
    file: UploadFile = File(...),
    exercise_key: str = Form("biceps_curl"),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))

        # Validate required columns are present
        required_cols = {"ms", "gyro_mag_rads", "accel_mag_g"}
        missing = required_cols - set(df.columns)
        if missing:
            raise ValueError(f"CSV is missing required columns: {missing}")

        rep_metrics, chart_data = analyze_reps(df, exercise_key)

        # Summarise flags across all reps for the session-level view
        all_flags = [flag for r in rep_metrics for flag in r["form_flags"]]
        flag_counts = {f: all_flags.count(f) for f in set(all_flags)}

        iqr_outlier_count = sum(1 for r in rep_metrics if r["is_iqr_outlier"])
        ml_outlier_count  = sum(1 for r in rep_metrics if r["is_ml_outlier"])

        return {
            "status": "success",
            "exercise": EXERCISE_CONFIG.get(
                exercise_key, EXERCISE_CONFIG["biceps_curl"]
            )["name"],
            "summary": {
                "total_reps":      len(rep_metrics),
                "average_score":   round(
                    sum(r["score"] for r in rep_metrics) / len(rep_metrics), 1
                ) if rep_metrics else 0,
                "flag_counts":     flag_counts,       
                "iqr_outlier_reps": iqr_outlier_count,
                "ml_outlier_reps":  ml_outlier_count,
            },
            "rep_details": rep_metrics,
            "chart_data":  chart_data,
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")