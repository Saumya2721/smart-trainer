import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import WorkoutCharts from './components/WorkoutCharts';

function App() {
  const [workoutData, setWorkoutData] = useState(null);

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Smart Trainer Dashboard</h1>
        <p>Upload your ESP8266 IMU data to analyze your form.</p>
      </div>

      <FileUpload onUploadSuccess={setWorkoutData} />

      {workoutData && (
        <>
          <div className="summary-banner">
            <span>Exercise: {workoutData.exercise}</span>
            <span>Total Reps: {workoutData.summary.total_reps}</span>
            <span>Avg Score: {workoutData.summary.average_score}/100</span>
            <span>IQR Outlier Reps: {workoutData.summary.iqr_outlier_reps}</span>
            <span>ML Outlier Reps: {workoutData.summary.ml_outlier_reps}</span>
          </div>

          <WorkoutCharts data={workoutData} />
        </>
      )}
    </div>
  );
}

export default App;