'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

// Interfaces
interface Batch {
  id: number;
  batch_code: string;
  expiry_date: string;
  quantity: number;
  buying_price: number;
  product__id: number;
  product__name: string;
}

interface Product {
  id: number;
  name: string;
  threshold: number;
  total_stock: number;
}

interface MostSoldItem {
  product__id: number;
  product__name: string;
  total_sold: number;
}

interface StockMovement {
  date: string;
  Restocked: number;
  Sold: number;
}

// Main Component
export default function StockReportPage() {
  const [data, setData] = useState<{
    expiredBatches: Batch[];
    soonExpiringBatches: Batch[];
    lowStockProducts: Product[];
    mostSoldItems: MostSoldItem[];
    stockMovement: StockMovement[];
    totalExpiredLoss: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/reports/summary/stock/?period=${period}`,
          { withCredentials: true }
        );
        setData(res.data);
      } catch (e: any) {
        setError(e.message || 'Failed to load stock report');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [period]);

  // Pie chart data
  const pieData = data?.expiredBatches?.reduce((acc: any[], batch) => {
    const loss = batch.quantity * batch.buying_price;
    const existing = acc.find(item => item.name === batch.product__name);
    if (existing) {
      existing.value += loss;
    } else {
      acc.push({ name: batch.product__name, value: loss });
    }
    return acc;
  }, []) || [];

  const pieColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

  if (loading) return <p className="text-center py-8">Loading stock report...</p>;
  if (error) return <p className="text-center py-8 text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div className="px-4 py-6 sm:px-6 space-y-8 min-h-screen bg-white dark:bg-[#000000] text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6">Stock Report</h1>

      {/* Period Selector */}
      <div className="flex flex-wrap gap-3 mb-6">
        {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p as any)}
            className={`px-4 py-2 rounded-full text-sm md:text-base font-semibold ${
              period === p
                ? 'bg-brand-400 text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <CardNav label="Expired Batches" count={data.expiredBatches.length} color="red" target="expired-batches" />
        <CardNav label="Soon Expiring" count={data.soonExpiringBatches.length} color="yellow" target="soon-expiring" />
        <CardNav label="Low Stock" count={data.lowStockProducts.length} color="orange" target="low-stock" />
        <CardNav label="Most Sold" count={data.mostSoldItems.length} color="blue" target="most-sold" />
        <CardNav label="Stock Movement" count={data.stockMovement.length} color="green" target="stock-movement" />
        <div className="p-4 rounded-xl shadow bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200">
          <h3 className="text-lg font-bold">Expired Loss</h3>
          <p className="text-sm">
            {data.totalExpiredLoss.toLocaleString()} TZS
          </p>
        </div>
      </div>

      {/* Expired Batches */}
      <Section id="expired-batches" title="Expired Batches">
        {data.expiredBatches.length === 0 ? (
          <p>No expired batches currently.</p>
        ) : (
          <BatchTable batches={data.expiredBatches} />
        )}
      </Section>

      {/* Expired Loss Pie Chart */}
      {pieData.length > 0 && (
        <Section id="expired-loss-chart" title="Expired Loss by Product">
          <div className="w-full h-80 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0a0a0a]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => `${val.toLocaleString()} TZS`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}


      {/* Soon Expiring Batches */}
      <Section id="soon-expiring" title="Soon Expiring Batches (Next 180 days)">
        {data.soonExpiringBatches.length === 0 ? (
          <p>No batches expiring soon.</p>
        ) : (
          <BatchTable batches={data.soonExpiringBatches} />
        )}
      </Section>

      {/* Low Stock Products */}
      <Section id="low-stock" title="Low Stock Products">
        {data.lowStockProducts.length === 0 ? (
          <p>No low stock products.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 dark:border-gray-700 text-sm sm:text-base">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-center">Threshold</th>
                  <th className="p-2 text-center">Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockProducts.map((product) => (
                  <tr key={product.id} className="even:bg-gray-50 dark:even:bg-gray-900">
                    <td className="p-2 break-words whitespace-normal">{product.name}</td>
                    <td className="p-2 text-center">{product.threshold}</td>
                    <td className="p-2 text-center">{product.total_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Most Sold Medicines */}
      <Section id="most-sold" title="Most Sold Medicines (Top 10)">
        {data.mostSoldItems.length === 0 ? (
          <p>No sales data yet.</p>
        ) : (
          <div className="w-full min-h-[16rem] sm:h-64 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0a0a0a]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.mostSoldItems.map((item) => ({
                  name: item.product__name,
                  sold: item.total_sold,
                }))}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="sold" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Stock Movement */}
      <Section id="stock-movement" title="Stock Movement (Restocked vs Sold)">
        {data.stockMovement.length === 0 ? (
          <p>No stock movement data yet.</p>
        ) : (
          <div className="w-full min-h-[16rem] sm:h-64 p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#0a0a0a]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stockMovement} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Restocked" stackId="a" fill="#10b981" />
                <Bar dataKey="Sold" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>
    </div>
  );
}

function CardNav({ label, count, color, target }: { label: string; count: number; color: 'red' | 'yellow' | 'orange' | 'blue' | 'green'; target: string }) {
  const colorMap = {
    red: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    yellow: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    orange: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
    blue: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    green: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  };
  return (
    <button
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' })}
      className={`p-4 rounded-xl shadow hover:shadow-lg transition text-left ${colorMap[color]}`}
    >
      <h3 className="text-lg font-bold">{label}</h3>
      <p className="text-sm">{count} items</p>
    </button>
  );
}

// Batch Table
function BatchTable({ batches }: { batches: Batch[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-gray-300 dark:border-gray-700 text-sm sm:text-base">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-800">
            <th className="p-2 text-left">Product</th>
            <th className="p-2 text-center">Batch Code</th>
            <th className="p-2 text-center">Expiry Date</th>
            <th className="p-2 text-center">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id} className="even:bg-gray-50 dark:even:bg-[#0a0a0a]">
              <td className="p-2 break-words whitespace-normal">{batch.product__name}</td>
              <td className="p-2 text-center">{batch.batch_code}</td>
              <td className="p-2 text-center">{batch.expiry_date}</td>
              <td className="p-2 text-center">{batch.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Section wrapper
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}