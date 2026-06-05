# 💪 Smart Trainer: AI-Powered Biomechanics Dashboard

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![C++](https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

**Smart Trainer** is a full-stack, hardware-to-cloud fitness ecosystem. It captures physical movement via a custom-built IoT wearable, processes the kinematics through a Python Machine Learning microservice, and visualizes real-time form feedback on an interactive React dashboard.

---

## 📸 Project Showcase

*(Replace these links with your actual image paths once uploaded to GitHub)*

| Hardware Setup | Web Dashboard | ML Anomaly Detection |
| :---: | :---: | :---: |
| <img src="docs/hardware-photo.jpg" width="250"/> | <img src="docs/dashboard-photo.png" width="250"/> | <img src="docs/chart-photo.png" width="250"/> |
| *ESP8266 + ICM-20948 IMU* | *React + Vite Interface* | *Recharts + Jerk Outliers* |

---

## 🚀 Key Features

* **Custom IoT Wearable:** C++ firmware running on an ESP8266, sampling 9-axis IMU data (ICM-20948) at ~66Hz with local SD card logging.
* **3-Layer Anomaly Detection Pipeline:** Replaces "black-box" ML with a robust diagnostic engine:
  1. **Physics/Rule-Based Engine:** Detects severe form breaks (Jerk spikes, asymmetric tempo, short ROM).
  2. **Statistical Outliers:** Applies IQR (Interquartile Range) to dynamically find reps that deviate from a user's session baseline.
  3. **Machine Learning:** Utilizes an Unsupervised `One-Class SVM` to detect subtle biomechanical instability across a rep's entire feature vector.
* **Full-Stack Web App:** A Node/Express gateway handles file routing and PostgreSQL persistence, while a React frontend provides drag-and-drop uploads and interactive kinematic charts (via `recharts`).

---

## 🧠 System Architecture

The project is split into a **Monorepo** containing three distinct services:

### 1. Hardware (`/hardware`)
* **Microcontroller:** ESP8266 (NodeMCU / Wemos D1 Mini)
* **Sensor:** Adafruit ICM-20948 (9-DOF IMU) + Madgwick AHRS Filter
* **Features:** Hardware toggle switch between "Live Web UI" mode (real-time charting via captive portal) and "SD Logging" mode (10Hz CSV writing for ML training).

### 2. ML Microservice (`/ml-service`)
* **Framework:** Python, FastAPI, Pandas, Scikit-Learn, SciPy
* **Logic:** Accepts raw CSV uploads, applies adaptive smoothing filters to accelerometer data to calculate elbow angle, segments data into reps via peak detection, and runs the 3-Layer Scoring Algorithm. Returns a heavily structured JSON diagnostic report.

### 3. Web Dashboard (`/backend` & `/frontend`)
* **Backend:** Node.js, Express, Multer. Acts as an API Gateway, proxying files to the ML service and saving workout summaries (Total Reps, Avg Score) into a **PostgreSQL** database.
* **Frontend:** React, Vite, Axios, React-Dropzone, Recharts. Renders form analysis (Elbow Angle ° over time) and overlays ML Outliers directly onto the Gyroscope magnitude plot.

---

## 🛠️ Getting Started (Local Development)

### Prerequisites
* Node.js (v18+)
* Python (3.9+)
* PostgreSQL running locally

### 1. Clone the Repository
```bash
git clone [https://github.com/Saumya2721/smart-trainer.git](https://github.com/Saumya2721/smart-trainer.git)
cd smart-trainer
