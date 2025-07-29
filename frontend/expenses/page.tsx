'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

interface ExpenseItem {
  id: number;
  amount: number;
  date: string;
  category: string;
  description: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent',
  electricity: 'Electricity',
  salary: 'Salary',
  inventory: 'Inventory Refill',
  misc: 'Miscellaneous',
};

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/expenses/`,
        {
          params: {
            start_date: startDate,
            end_date: endDate,
          },
          withCredentials: true,
        }
      );

      const formatted = res.data.map((item: any) => ({
        id: item.id,
        amount: parseFloat(item.amount),
        date: item.date,
        category: item.category,
        description: item.description,
      }));

      formatted.sort((a: { date: string | number | Date; }, b: { date: string | number | Date; }) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setExpenses(formatted);
    } catch (err) {
      setError('Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [startDate, endDate]);

  const filteredExpenses = expenses.filter((exp) => {
    const categoryLabel = CATEGORY_LABELS[exp.category] || exp.category;
    return (
      categoryLabel.toLowerCase().includes(search.toLowerCase()) ||
      exp.description.toLowerCase().includes(search.toLowerCase())
    );
  });

  const total = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-6 text-sm">
      <PageBreadcrumb pageTitle="Expenses Records" />
      <h1 className="text-xl font-bold text-gray-800 dark:text-white">Expenses</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by description or category..."
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40"
        />

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 dark:bg-white/10 dark:text-white"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 dark:bg-white/10 dark:text-white"
        />
      </div>

      {/* Feedback */}
      {loading && <p className="text-gray-600 dark:text-gray-300">Loading expenses...</p>}
      {error && <p className="text-red-600 font-semibold">{error}</p>}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[700px]">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-white/10">
                <tr>
                  {['ID', 'Description', 'Amount (TZS)', 'Category', 'Date'].map((head) => (
                    <th
                      key={head}
                      className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-white/10">
                      <td className="px-5 py-4 text-gray-700 dark:text-white">{exp.id}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">{exp.description}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">
                        {exp.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">
                        {CATEGORY_LABELS[exp.category] || exp.category}
                      </td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">
                        {new Date(exp.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">
                      No matching expenses found.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot className="bg-gray-100 dark:bg-white/10">
                  <tr>
                    <td colSpan={2} className="px-5 py-4 font-semibold text-gray-800 dark:text-white">
                      Total
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-800 dark:text-white">
                      {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
