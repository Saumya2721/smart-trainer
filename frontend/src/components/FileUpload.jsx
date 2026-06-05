import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { UploadCloud, FileText, Loader2, CheckCircle } from 'lucide-react';

const FileUpload = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [exerciseKey, setExerciseKey] = useState('biceps_curl');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile && selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please upload a valid .csv file.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('exercise_key', exerciseKey);

    try {
      const response = await axios.post('/api/workouts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      onUploadSuccess(response.data);
      setFile(null); 
    } catch (err) {
      console.error(err);
      setError('Failed to process the workout. Is the backend running?');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <div className="selector-container">
        <label className="selector-label">Select Exercise:</label>
        <select 
          value={exerciseKey} 
          onChange={(e) => setExerciseKey(e.target.value)}
          className="selector-input"
        >
          <option value="biceps_curl">Biceps Curl (Supinated)</option>
        </select>
      </div>

      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        {file ? (
          <div className="file-info">
            <FileText size={40} color="#3b82f6" />
            <p><strong>{file.name}</strong> ready for analysis.</p>
          </div>
        ) : (
          <div className="file-info">
            <UploadCloud size={48} color="#9ca3af" />
            <p>Drag & drop your IMU .csv file here, or click to select</p>
          </div>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      <button 
        onClick={handleUpload} 
        disabled={!file || isUploading}
        className="upload-button"
      >
        {isUploading ? (
          <><Loader2 className="spinner" size={18} style={{ marginRight: '8px' }} /> Analyzing Form...</>
        ) : (
          <><CheckCircle size={18} style={{ marginRight: '8px' }} /> Analyze Workout</>
        )}
      </button>
    </div>
  );
};

export default FileUpload;