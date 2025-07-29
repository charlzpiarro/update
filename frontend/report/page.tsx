'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BoxIconLine,
  DollarLineIcon,
} from '@/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from 'recharts';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="p-3 rounded-lg border bg-white dark:bg-[#111] text-sm shadow-md dark:shadow-black">
        <p className="font-semibold text-gray-800 dark:text-white mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex justify-between gap-4 mb-1">
            <span className="text-gray-600 dark:text-gray-300">{entry.name}</span>
            <span className="font-semibold" style={{ color: entry.color }}>
              TZS {entry.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const { name, value, percent, fill } = payload[0];
    return (
      <div className="p-3 rounded-lg border bg-white dark:bg-[#111] text-sm shadow-md dark:shadow-black">
        <p className="font-semibold text-gray-800 dark:text-white mb-1">{name}</p>
        <p className="text-gray-600 dark:text-gray-300">TZS {value.toLocaleString()}</p>
        <p style={{ color: fill }}>{(percent * 100).toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

export default function ReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/reports/summary/?period=${period}`,
          { withCredentials: true }
        );
        setData(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch report.');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [period]);

  const summaryCards = [
    { label: 'Stock Buying', value: data?.stockBuying || 0, icon: DollarLineIcon, color: 'bg-indigo-100 dark:bg-indigo-900' },
    { label: 'Sales', value: data?.sales || 0, icon: BoxIconLine, color: 'bg-white dark:bg-black' },
    // { label: 'Revenue', value: data?.stockSelling || 0, icon: DollarLineIcon, color: 'bg-brand-400 text-white' },
    // { label: 'Profit', value: data?.profit || 0, icon: DollarLineIcon, color: 'bg-green-100 dark:bg-green-900' },
    { label: 'Loss', value: data?.loss || 0, icon: DollarLineIcon, color: 'bg-rose-100 dark:bg-rose-900' },
    { label: 'Orders', value: data?.orders || 0, icon: BoxIconLine, color: 'bg-blue-100 dark:bg-blue-900' },
    { label: 'Wholesaler Sales', value: data?.wholesalerSales || 0, icon: DollarLineIcon, color: 'bg-purple-100 dark:bg-purple-900' },
    { label: 'Wholesale Profit', value: data?.wholesalerProfit || 0, icon: DollarLineIcon, color: 'bg-purple-100 dark:bg-purple-900' },
    { label: 'Retailer Sales', value: data?.retailerSales || 0, icon: DollarLineIcon, color: 'bg-yellow-100 dark:bg-yellow-900' },
    { label: 'Retail Profit', value: data?.retailerProfit || 0, icon: DollarLineIcon, color: 'bg-yellow-100 dark:bg-yellow-900' },
  ];

  const pieData = [
    { name: 'Paid Loans', value: data?.loansPaid || 0 },
    { name: 'Unpaid Loans', value: data?.loansUnpaid || 0 },
    { name: 'Refunds', value: data?.refundAmount || 0 },
  ];

  const barData = (data?.chart?.dates || []).map((date: string, i: number) => ({
    date,
    Sales: data.chart.sales[i] || 0,
    Expenses: data.chart.expenses[i] || 0,
    Refunds: data.chart.refunds[i] || 0,
  }));

  return (
    <div className="p-6 space-y-6 min-h-screen bg-white dark:bg-[#000000]">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <div className="flex gap-2">
          {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                period === p
                  ? 'bg-brand-400 text-white'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center text-gray-500 dark:text-gray-400">Loading report...</div>}
      {error && <div className="text-center text-red-500">{error}</div>}

      {!loading && data && (
        <>
          {/* All Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} card={card} />
            ))}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-2 bg-white dark:bg-[#000000] border border-gray-200 dark:border-[#111] rounded-xl p-4">
              <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Sales Overview</h2>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={barData} barCategoryGap={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#a0a0a0', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#a0a0a0', fontSize: 12 }} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="Sales" fill="#3b82f6" barSize={10} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#ef4444" barSize={10} radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Refunds" fill="#f59e0b" barSize={10} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-[#000000] border border-gray-200 dark:border-[#111] rounded-xl p-4">
              <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Loan & Refund Summary</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white dark:bg-[#000000] border border-gray-200 dark:border-[#111] rounded-xl p-4">
              <h3 className="text-md font-semibold mb-3 text-gray-800 dark:text-white">Refund % of Revenue</h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  barSize={15}
                  startAngle={90}
                  endAngle={450}
                  data={[{
                    name: 'Refund %',
                    value: data?.stockSelling ? (data.refundAmount / data.stockSelling) * 100 : 0,
                    fill: '#f87171',
                  }]}
                >
                  <RadialBar background dataKey="value" cornerRadius={8} />
                  <Tooltip content={<CustomPieTooltip />} />
                </RadialBarChart>
              </ResponsiveContainer>
              <p className="text-sm text-center mt-2 text-gray-500 dark:text-gray-400">
                {(data?.stockSelling && data?.refundAmount)
                  ? `${((data.refundAmount / data.stockSelling) * 100).toFixed(1)}% of revenue refunded`
                  : 'No data yet'}
              </p>
            </div>

            <div className="bg-white dark:bg-[#000000] border border-gray-200 dark:border-[#111] rounded-xl p-4 flex flex-col justify-center">
              <h3 className="text-md font-semibold mb-4 text-gray-800 dark:text-white">Quick Stats</h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-green-800 text-green-300 text-sm font-medium">
                  ✅ Paid Loans: {data?.loansPaid || 0}
                </span>
                <span className="px-3 py-1 rounded-full bg-red-800 text-red-300 text-sm font-medium">
                  ❌ Unpaid Loans: {data?.loansUnpaid || 0}
                </span>
                <span className="px-3 py-1 rounded-full bg-yellow-800 text-yellow-300 text-sm font-medium">
                  💸 Refunds: {data?.refundAmount || 0}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#000000] border border-gray-200 dark:border-[#111] rounded-xl p-4">
              <h3 className="text-md font-semibold mb-3 text-gray-800 dark:text-white">Profit Breakdown</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Profit', value: data?.profit || 0 },
                      { name: 'Loss', value: data?.loss || 0 },
                    ]}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ card }: { card: any }) {
  return (
    <div className={`rounded-2xl p-5 border border-gray-200 dark:border-[#111] ${card.color}`}>
      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-black">
        <card.icon className="text-gray-800 dark:text-white" />
      </div>
      <div className="flex items-end justify-between mt-4">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{card.label}</span>
          <h4 className="mt-1 font-bold text-xl text-gray-800 dark:text-white">
            TZS {Number(card.value).toLocaleString()}
          </h4>
        </div>
      </div>
    </div>
  );
}
