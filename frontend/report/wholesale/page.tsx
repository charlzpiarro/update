"use client";

import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

const PERIODS = ["daily", "weekly", "monthly", "yearly", "custom"];

export default function WholesaleReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("daily");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [staffList, setStaffList] = useState<{ id: number; username: string }[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/users/staff/`, {
        withCredentials: true,
      })
      .then((res) => setStaffList(res.data))
      .catch(() => setStaffList([]));
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = [];
      if (period === "custom" && customStart && customEnd) {
        params.push(`period=custom`);
        params.push(`start=${customStart}`);
        params.push(`end=${customEnd}`);
      } else {
        params.push(`period=${period}`);
      }
      if (selectedStaff) {
        params.push(`user_id=${selectedStaff}`);
      }
      const queryString = params.length ? `?${params.join("&")}` : "";
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/reports/wholesale/${queryString}`,
        { withCredentials: true }
      );

      let fetched;
      if (period === "custom") {
        if (Array.isArray(res.data)) {
          fetched = res.data;
        } else if (res.data && Array.isArray(res.data.custom)) {
          fetched = res.data.custom;
        } else {
          fetched = [];
        }
      } else {
        fetched = Array.isArray(res.data[period]) ? res.data[period] : [];
      }

      setData(fetched);
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || err.message || "Failed to fetch report.";
      setError(errMsg);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== "custom") {
      fetchReport();
      setCustomStart("");
      setCustomEnd("");
    }
  }, [period, selectedStaff]);

  const handleDownload = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open("", "", "width=900,height=650");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Wholesale Report - ${period}</title>
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

  const totalAmount = data.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalDiscount = data.reduce((sum, o) => sum + (o.discount || 0), 0);
  const totalProfit = data.reduce((sum, o) => sum + (o.profit || 0), 0);

  const isValidCustomRange = customStart && customEnd && customEnd >= customStart;

  return (
    <div className="p-6 space-y-6 bg-white dark:bg-[#000000] min-h-screen">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wholesale Orders Report</h1>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p !== "custom") {
                  setCustomStart("");
                  setCustomEnd("");
                }
              }}
              disabled={loading}
              className={`px-4 py-1 rounded-full text-sm font-medium capitalize transition ${
                period === p
                  ? "bg-brand-400 text-white ring-2 ring-green-400"
                  : "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300 hover:bg-green-600 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={handleDownload}
            disabled={loading || data.length === 0}
            className="px-4 py-1 rounded-full bg-green-600 text-white font-semibold hover:bg-green-700 transition"
          >
            ⬇️ Download Report
          </button>
        </div>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded px-3 py-1 border text-sm dark:bg-[#111] dark:text-white"
          />
          <span className="text-gray-600 dark:text-gray-300">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded px-3 py-1 border text-sm dark:bg-[#111] dark:text-white"
          />
          <button
            onClick={fetchReport}
            disabled={!isValidCustomRange}
            className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
          >
            Apply
          </button>
        </div>
      )}

      <div className="mt-4 max-w-xs">
        <label className="block mb-1 text-gray-700 dark:text-gray-300 font-semibold">Filter by Staff:</label>
        <select
          value={selectedStaff}
          onChange={(e) => setSelectedStaff(e.target.value)}
          className="w-full rounded border px-3 py-1 text-gray-900 dark:bg-[#111] dark:text-white"
        >
          <option value="">All Staff</option>
          {staffList.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.username}
            </option>
          ))}
        </select>
        {staffList.length === 0 && (
          <p className="text-red-500 mt-1">Failed to load staff list.</p>
        )}
      </div>

      {loading && <p className="text-center text-gray-500">Loading report...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}

      {!loading && data && (
        <div ref={printRef} className="space-y-6">
          <div className="grid grid-cols-3 gap-6 w-full max-w-full">
            <SummaryCard label="Total Amount" value={totalAmount} color="bg-green-100 dark:bg-green-900" />
            <SummaryCard label="Total Discount (%)" value={totalDiscount} color="bg-indigo-100 dark:bg-indigo-900" />
            <SummaryCard label="Total Profit" value={totalProfit} color="bg-yellow-100 dark:bg-yellow-900" />
          </div>

          <div className="bg-white dark:bg-[#111] rounded-xl p-4 border dark:border-[#222]">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Orders Summary</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left table-fixed">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2">Order ID</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Staff</th>
                    <th className="px-4 py-2">Date (EAT)</th>
                    <th className="px-4 py-2">Discount (%)</th>
                    <th className="px-4 py-2">Total (TZS)</th>
                    <th className="px-4 py-2">Profit (TZS)</th>
                  </tr>
                </thead>
              </table>

              <div className="max-h-[400px] overflow-y-auto">
                <table className="min-w-full text-sm text-left table-fixed">
                  <tbody>
                    {data.map((order: any) => (
                      <tr key={order.id} className="border-b dark:border-gray-700">
                        <td className="px-4 py-2 text-gray-900 dark:text-white">{order.id}</td>
                        <td className="px-4 py-2">{order.customer || "-"}</td>
                        <td className="px-4 py-2">{order.user || "-"}</td>
                        <td className="px-4 py-2">{order.date}</td>
                        <td className="px-4 py-2">{order.discount}%</td>
                        <td className="px-4 py-2 text-green-600 dark:text-green-400">
                          {Number(order.total).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-yellow-600 dark:text-yellow-400">
                          {Number(order.profit).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {data.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No wholesale data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fixed footer */}
              <table className="min-w-full text-sm text-left table-fixed">
                <tfoot className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold">
                  <tr>
                    <td colSpan={4} className="px-4 py-2">Total</td>
                    <td className="px-4 py-2">{totalDiscount.toFixed(2)}%</td>
                    <td className="px-4 py-2">{totalAmount.toLocaleString()}</td>
                    <td className="px-4 py-2">{totalProfit.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className={`w-full rounded-2xl p-8 border border-gray-200 dark:border-[#111] flex flex-col items-center justify-center ${color}`}
      style={{ minHeight: "180px" }}
    >
      <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">{label}</span>
      <h4 className="mt-2 font-extrabold text-3xl text-gray-800 dark:text-white">
        TZS {Number(value).toLocaleString()}
      </h4>
    </div>
  );
}
