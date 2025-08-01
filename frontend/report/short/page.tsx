"use client";

import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function ShortReportPage() {
  const [report, setReport] = useState<
    {
      date: string;
      total_sales: number;
      wholesale_sales: number;
      retail_sales: number;
      sales_count: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  const getToken = () => {
    return localStorage.getItem("token");
  };

  const fetchReport = async (customStart?: string, customEnd?: string) => {
    setLoading(true);
    setError(null);
    try {
      // ✅ Always ensure a fallback date is passed
      const today = new Date().toISOString().split("T")[0];
      const start = customStart || startDate || today;
      const end = customEnd || endDate || today;

      const url = `${
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      }/api/report/short/?start=${start}&end=${end}`;

      const token = getToken();

      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        withCredentials: true,
      });

      setReport(res.data.report);

      if (!startDate) setStartDate(res.data.start_date || today);
      if (!endDate) setEndDate(res.data.end_date || today);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || "Failed to load report");
      setReport([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Set today's date and fetch report immediately on mount
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
    fetchReport(today, today);
  }, []);

  const isValidRange = startDate && endDate && endDate >= startDate;

  const handleDownload = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open("", "", "width=900,height=650");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Sales Short Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="p-6 bg-white dark:bg-[#000000] min-h-screen space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sales Short Report</h1>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-gray-700 dark:text-gray-300">Start Date:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded border px-3 py-1 dark:bg-gray-900 dark:text-white"
        />
        <label className="text-gray-700 dark:text-gray-300">End Date:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded border px-3 py-1 dark:bg-gray-900 dark:text-white"
        />
        <button
          onClick={() => fetchReport()}
          disabled={!isValidRange || loading}
          className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Apply Filter
        </button>
        <button
          onClick={handleDownload}
          disabled={loading || report.length === 0}
          className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          ⬇️ Download Report
        </button>
      </div>

      {loading && <p className="text-gray-500 dark:text-gray-400">Loading report...</p>}
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

      <div ref={printRef}>
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700 mt-4 text-gray-900 dark:text-white">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="border px-4 py-2">Date</th>
              <th className="border px-4 py-2">Retail Paid Sales (TZS)</th>
              <th className="border px-4 py-2">Wholesale Paid Sales (TZS)</th>
              <th className="border px-4 py-2">Total Paid Sales (TZS)</th>
              <th className="border px-4 py-2">Sales Count</th>
            </tr>
          </thead>
          <tbody>
            {report.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center px-4 py-4 text-gray-500 dark:text-gray-400">
                  No sales data found for this date range.
                </td>
              </tr>
            ) : (
              report.map((item) => (
                <tr key={item.date}>
                  <td className="border px-4 py-2">{item.date}</td>
                  <td className="border px-4 py-2">
                    {Number(item.retail_sales || 0).toLocaleString()}
                  </td>
                  <td className="border px-4 py-2">
                    {Number(item.wholesale_sales || 0).toLocaleString()}
                  </td>
                  <td className="border px-4 py-2">
                    {Number(item.total_sales || 0).toLocaleString()}
                  </td>
                  <td className="border px-4 py-2">{item.sales_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
