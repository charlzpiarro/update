'use client';

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { DollarLineIcon } from '@/icons';

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

export default function ReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('daily');
  const printRef = useRef<HTMLDivElement>(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/reports/profit/?period=${period}`,
        { withCredentials: true }
      );
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [period]);

  // Download the report page content and trigger print
  const handleDownload = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'width=900,height=650');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Report - ${period}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .card {
              border: 1px solid #ddd; 
              border-radius: 12px; 
              padding: 20px; 
              margin-bottom: 20px;
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center;
              min-height: 180px;
            }
            .card h4 {
              margin-top: 10px;
              font-size: 2rem;
            }
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

  // Calculate totals for the product table
  const totals = {
    buying: data?.products?.reduce((acc: number, p: any) => acc + p.buying_total, 0) || 0,
    selling: data?.products?.reduce((acc: number, p: any) => acc + p.selling_total, 0) || 0,
    profit: data?.products?.reduce((acc: number, p: any) => acc + p.profit, 0) || 0,
  };

  const summaryCards = [
    { label: 'Stock Cost (Buying)', value: data?.stockBuying || 0, icon: DollarLineIcon, color: 'bg-indigo-100 dark:bg-indigo-900' },
    { label: 'Total Profit', value: data?.profit || 0, icon: DollarLineIcon, color: 'bg-green-100 dark:bg-green-900' },
  ];

  return (
    <div className="p-6 space-y-6 bg-white dark:bg-[#000000] min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profit & Financial Report</h1>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1 rounded-full text-sm font-medium capitalize ${
                period === p
                  ? 'bg-brand-400 text-white'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={handleDownload}
            className="px-4 py-1 rounded-full bg-green-600 text-white font-semibold"
          >
            ⬇️ Download Report
          </button>
        </div>
      </div>

      {loading && <p className="text-center text-gray-500">Loading report...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}

      {!loading && data && (
        <div ref={printRef} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-6 w-full max-w-full">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} card={card} />
            ))}
          </div>

          {/* Products Table */}
          <div className="bg-white dark:bg-[#111] rounded-xl p-4 border dark:border-[#222]">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Product Report</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Buying (TZS)</th>
                    <th className="px-4 py-2">Selling (TZS)</th>
                    <th className="px-4 py-2">Profit (TZS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products?.map((prod: any) => (
                    <tr key={prod.name} className="border-b dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{prod.name}</td>
                      <td className="px-4 py-2 text-red-600 dark:text-red-400">
                        {Number(prod.buying_total).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-blue-600 dark:text-blue-400">
                        {Number(prod.selling_total).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-green-600 dark:text-green-400">
                        {Number(prod.profit).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {data.products?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">
                        No product data available.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals row */}
                <tfoot className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold">
                  <tr>
                    <td className="px-4 py-2 text-left">Total</td>
                    <td className="px-4 py-2">{totals.buying.toLocaleString()}</td>
                    <td className="px-4 py-2">{totals.selling.toLocaleString()}</td>
                    <td className="px-4 py-2">{totals.profit.toLocaleString()}</td>
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

function SummaryCard({ card }: { card: any }) {
  return (
    <div
      className={`w-full rounded-2xl p-8 border border-gray-200 dark:border-[#111] flex flex-col items-center justify-center ${card.color}`}
      style={{ minHeight: '180px' }}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gray-100 dark:bg-black mb-4">
        <card.icon className="text-gray-800 dark:text-white" size={32} />
      </div>
      <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">{card.label}</span>
      <h4 className="mt-2 font-extrabold text-3xl text-gray-800 dark:text-white">
        TZS {Number(card.value).toLocaleString()}
      </h4>
    </div>
  );
}
