import React, { useEffect, useState } from 'react';
import Papa from 'papaparse'; // Library untuk membaca CSV

function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    // Ganti URL ini dengan URL CSV dari Google Sheets Anda
    const sheetUrl = 'URL_CSV_GOOGLE_SHEETS_ANDA';
    
    Papa.parse(sheetUrl, {
      download: true,
      header: true,
      complete: (results) => {
        setData(results.data);
      }
    });
  }, []);

  // Logika untuk menghitung Total, Running, Standby, Breakdown
  const total = data.length;
  const running = data.filter(d => d.Status === 'Running').length;
  const standby = data.filter(d => d.Status === 'Standby').length;
  const breakdown = data.filter(d => d.Status === 'Breakdown').length;

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {/* Header & Summary Cards di sini */}
      
      {/* Grid Site */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {/* Looping untuk 5 Site */}
      </div>

      {/* Breakdown Report */}
    </div>
  );
}

export default Dashboard;