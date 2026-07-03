'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';

export default function JoinPage() {
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  // Capture an attributed invite link (…/join?ref=<memberId>) so the application
  // is credited to the member who invited them.
  useEffect(() => {
    setRef(new URLSearchParams(window.location.search).get('ref'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ref }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-bloc-navy to-bloc-blue flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Thank You, {form.name}!
          </h2>
          <p className="text-slate-600 mb-6">
            Your information has been submitted to the BLOC Membership Team.
            Someone will reach out to you soon about attending an upcoming event.
          </p>
          <a
            href="https://businessleadersofcharlotte.com"
            className="inline-flex items-center gap-2 text-bloc-blue hover:text-bloc-navy font-medium"
          >
            <span>Visit BLOC Website</span>
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-bloc-navy to-bloc-blue">
      <div className="max-w-lg mx-auto px-4 py-12 sm:py-20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-bloc-navy font-bold text-2xl">B</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Join BLOC
          </h1>
          <p className="text-blue-200">
            Business Leaders of Charlotte
          </p>
          <p className="text-blue-300 text-sm mt-2 max-w-sm mx-auto">
            Building friendships, growing business, and strengthening our community.
            Fill out the form below and our membership team will be in touch.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                placeholder="John Smith"
                autoComplete="name"
                maxLength={120}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.company}
                onChange={(e) => updateField('company', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                placeholder="Smith Consulting LLC"
                autoComplete="organization"
                maxLength={120}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                placeholder="john@company.com"
                autoComplete="email"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                placeholder="704-555-0000"
                autoComplete="tel"
                maxLength={30}
              />
              <p className="text-xs text-slate-400 mt-1">Add at least an email or phone so we can reach you.</p>
            </div>

            <button
              type="submit"
              disabled={submitting || !form.name || !form.company || (!form.email && !form.phone)}
              className="w-full bg-bloc-blue text-white py-3 px-6 rounded-lg font-medium hover:bg-bloc-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Interest'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <a
            href="https://businessleadersofcharlotte.com"
            className="text-blue-200 hover:text-white text-sm inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to BLOC Website</span>
          </a>
        </div>
      </div>
    </div>
  );
}
