'use client';

import React, { useState } from 'react';
import axios from 'axios';

import ComponentCard from '@/components/common/ComponentCard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { ChevronDownIcon } from '@/icons';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

const CATEGORY_OPTIONS = [
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'salary', label: 'Salary' },
  { value: 'inventory', label: 'Inventory Refill' },
  { value: 'misc', label: 'Miscellaneous' },
];

export default function AddExpensePage() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const validateForm = () => {
    if (!description.trim()) return setError('Description is required.'), false;
    if (!amount || Number(amount) <= 0) return setError('Amount must be a positive number.'), false;
    if (!category) return setError('Please select a category.'), false;

    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/expenses/`,
        {
          description: description.trim(),
          amount: parseFloat(amount),
          category,
        },
        { withCredentials: true }
      );

      setSuccessMsg('Expense added successfully!');
      setDescription('');
      setAmount('');
      setCategory('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add expense.');
    } finally {
      setLoading(false);
    }
  };

    return (
      <div className="space-y-5">
        <PageBreadcrumb pageTitle="Add Expenses" />
      
    <div className="max-w-200 mx-auto px-4 sm:px-6 lg:px-8">
      <ComponentCard title="New Expense">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Description</Label>
            <Input
              type="text"
              placeholder="Brief description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="py-2 px-3 text-sm"
            />
          </div>

          <div>
            <Label>Amount (TZS)</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              min={0.01}
              step={0.01}
              onChange={(e) => setAmount(e.target.value)}
              className="py-2 px-3 text-sm"
            />
          </div>

          <div>
            <Label>Category</Label>
            <div className="relative">
              <Select
                options={CATEGORY_OPTIONS}
                placeholder="Select category"
                onChange={(val) => setCategory(val)}
                value={category}
                className="py-2 px-3 text-sm dark:bg-dark-900"
              />
              <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                <ChevronDownIcon />
              </span>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          {successMsg && <p className="text-green-600 text-sm font-medium">{successMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-400 px-4 py-2 text-sm text-white hover:bg-warning-400 transition disabled:opacity-60"
          >
            {loading ? 'Adding...' : 'Add Expense'}
          </button>
        </form>
      </ComponentCard>
    </div>
    </div>
  );

}
