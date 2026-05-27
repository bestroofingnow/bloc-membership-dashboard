'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  RotateCcw,
  User,
  Briefcase,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Linkedin,
  FileText,
  CreditCard,
} from 'lucide-react';
import { Card, Button, Input, useToast } from '@/components/ui';
import { useCardScanner, ScannedCard } from '@/hooks/useCardScanner';
import { useEvents } from '@/hooks/useEvents';
import { supabase } from '@/lib/supabase';

export function ScannerTab() {
  const {
    scanning,
    exporting,
    error,
    scannedCard,
    exportSuccess,
    scanCard,
    exportToCRM,
    reset,
    updateField,
    clearError,
  } = useCardScanner();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      clearError();
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      await scanCard(file);
    },
    [scanCard, clearError]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleReset = useCallback(() => {
    reset();
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [reset]);

  const fieldConfig: {
    key: keyof ScannedCard;
    label: string;
    icon: React.ReactNode;
    type?: string;
  }[] = [
    { key: 'name', label: 'Full Name', icon: <User size={16} /> },
    { key: 'title', label: 'Job Title', icon: <Briefcase size={16} /> },
    { key: 'company', label: 'Company', icon: <Building2 size={16} /> },
    { key: 'email', label: 'Email', icon: <Mail size={16} />, type: 'email' },
    { key: 'phone', label: 'Phone', icon: <Phone size={16} />, type: 'tel' },
    { key: 'address', label: 'Address', icon: <MapPin size={16} /> },
    { key: 'website', label: 'Website', icon: <Globe size={16} />, type: 'url' },
    { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin size={16} /> },
    { key: 'additionalNotes', label: 'Additional Notes', icon: <FileText size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-bloc-blue p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <CreditCard className="text-bloc-blue mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-bloc-navy">Business Card Scanner</h3>
            <p className="text-sm text-slate-600 mt-1">
              Snap a photo or upload a business card image. AI will extract the contact info
              automatically, and you can send it straight to GoHighLevel CRM.
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column: Upload Area */}
        <div className="space-y-4">
          <Card padding="md">
            <h4 className="font-semibold text-slate-900 mb-4">Upload Business Card</h4>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileInput}
              className="hidden"
            />

            {/* Drop zone */}
            {!previewUrl && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-bloc-blue bg-blue-50'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <Upload className="mx-auto text-slate-400 mb-3" size={40} />
                <p className="text-slate-600 font-medium">
                  Drag & drop a business card image here
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  or use the buttons below
                </p>
              </div>
            )}

            {/* Image Preview */}
            {previewUrl && (
              <div className="relative rounded-xl overflow-hidden border border-slate-200">
                <img
                  src={previewUrl}
                  alt="Business card preview"
                  className="w-full max-h-64 object-contain bg-slate-50"
                />
                {scanning && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-bloc-blue mx-auto" />
                      <p className="text-sm text-slate-600 mt-2">Analyzing business card...</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => cameraInputRef.current?.click()}
                disabled={scanning}
                className="flex-1"
              >
                <Camera size={16} className="mr-2" />
                Take Photo
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="flex-1"
              >
                <Upload size={16} className="mr-2" />
                Upload Image
              </Button>
            </div>

            {scannedCard && (
              <Button
                variant="ghost"
                onClick={handleReset}
                className="w-full mt-2"
              >
                <RotateCcw size={16} className="mr-2" />
                Scan Another Card
              </Button>
            )}
          </Card>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="text-red-800 font-medium text-sm">Error</p>
                <p className="text-red-600 text-sm mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Match panel — shows who this card is and what we did with it */}
          {scannedCard && (
            <ScanMatchPanel card={scannedCard} />
          )}

          {/* Export Success */}
          {exportSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 className="text-green-500 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="text-green-800 font-medium text-sm">Exported Successfully</p>
                <p className="text-green-600 text-sm mt-0.5">
                  Contact sent to GoHighLevel CRM. You can map the fields in your GHL workflow.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div>
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900">Extracted Contact Info</h4>
              {scannedCard && (
                <Button
                  onClick={() => exportToCRM()}
                  disabled={exporting || exportSuccess}
                  size="sm"
                >
                  {exporting ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : exportSuccess ? (
                    <>
                      <CheckCircle2 size={14} className="mr-2" />
                      Exported
                    </>
                  ) : (
                    <>
                      <Send size={14} className="mr-2" />
                      Send to CRM
                    </>
                  )}
                </Button>
              )}
            </div>

            {!scannedCard && !scanning && (
              <div className="text-center py-12 text-slate-400">
                <CreditCard size={48} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  Upload or photograph a business card to extract contact information
                </p>
              </div>
            )}

            {scanning && !scannedCard && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-bloc-blue mx-auto" />
                <p className="text-sm text-slate-500 mt-3">
                  AI is reading the business card...
                </p>
              </div>
            )}

            {scannedCard && (
              <div className="space-y-3">
                {fieldConfig.map(({ key, label, icon, type }) => {
                  if (key === 'scanId') return null;
                  const value = scannedCard[key] || '';
                  return (
                    <div key={key} className="flex items-start gap-3">
                      <div className="mt-3 text-slate-400 shrink-0">{icon}</div>
                      <Input
                        label={label}
                        type={type || 'text'}
                        value={value as string}
                        onChange={(e) => updateField(key, e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  );
                })}

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <Button
                    onClick={() => exportToCRM()}
                    disabled={exporting || exportSuccess}
                    className="w-full"
                    size="lg"
                  >
                    {exporting ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Sending to GoHighLevel...
                      </>
                    ) : exportSuccess ? (
                      <>
                        <CheckCircle2 size={16} className="mr-2" />
                        Sent to GoHighLevel CRM
                      </>
                    ) : (
                      <>
                        <Send size={16} className="mr-2" />
                        Export to GoHighLevel CRM
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScanMatchPanel — shown after a successful scan. Surfaces:
//   • what kind of match happened (member / existing guest / new guest)
//   • how many times this card has been scanned (network signal)
//   • inline "Invite to event" action that hits /api/admin/guest-invite
// ---------------------------------------------------------------------------
function ScanMatchPanel({ card }: { card: ScannedCard }) {
  const { events } = useEvents();
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const upcoming = events.filter(
    (e) => new Date(e.starts_at).getTime() >= Date.now() && e.public_visible,
  );

  const canInvite = card.guestId !== null && !!card.email;
  const totalOthers = Math.max(0, card.scanCount - 1);
  const othersPhrase = totalOthers === 0
    ? 'first time anyone has scanned this card'
    : totalOthers === 1
      ? '1 other member has scanned this card'
      : `${totalOthers} other members have scanned this card`;

  let header: React.ReactNode = null;
  if (card.matchType === 'existing_member') {
    header = (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-900">
          🤝 This is fellow BLOC member <strong>{card.memberName ?? card.name}</strong>
        </p>
        <p className="text-xs text-blue-700 mt-1">{othersPhrase}.</p>
      </div>
    );
  } else if (card.matchType === 'existing_guest') {
    header = (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          👋 <strong>{card.guestName ?? card.name}</strong> is already in the guest pipeline
        </p>
        <p className="text-xs text-amber-700 mt-1">{othersPhrase} — they may be a great candidate.</p>
      </div>
    );
  } else if (card.matchType === 'new_guest') {
    header = (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-semibold text-green-900">
          ✓ Added <strong>{card.guestName ?? card.name}</strong> to the guest pipeline
        </p>
        <p className="text-xs text-green-700 mt-1">Status: New Lead. {othersPhrase}.</p>
      </div>
    );
  } else if (card.matchType === 'no_email') {
    header = (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">No email detected on the card.</p>
        <p className="text-xs text-gray-600 mt-1">
          Add an email below before saving so we can dedupe future scans of the same contact.
        </p>
      </div>
    );
  }

  async function sendInvite() {
    if (!canInvite || !eventId) return;
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch('/api/admin/guest-invite', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          guest_id: card.guestId,
          event_id: eventId,
          custom_message: message || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(`Invite failed: ${body?.error ?? `error_${res.status}`}`);
      } else {
        toast.success(`Invite sent to ${card.email}`);
        setSent(true);
      }
    } catch (e) {
      toast.error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      {header}

      {canInvite && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Invite them to a meeting</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Sends an email with the event details + a calendar invite (.ics).
            </p>
          </div>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            disabled={sending || sent}
            className="w-full rounded border border-slate-300 p-2 text-sm disabled:opacity-50"
          >
            <option value="">— Pick an upcoming lunch / event —</option>
            {upcoming.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.starts_at).toLocaleDateString()} · {e.title}
                {e.chapter ? ` (${e.chapter})` : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending || sent}
            className="w-full rounded border border-slate-300 p-2 text-sm disabled:opacity-50"
            placeholder="Optional personal note (logged to guest notes)"
          />
          <Button
            onClick={sendInvite}
            disabled={!eventId || sending || sent}
            variant="primary"
            className="w-full"
          >
            {sent ? '✓ Invite sent' : sending ? 'Sending…' : 'Send invite'}
          </Button>
        </div>
      )}

      {card.matchType === 'existing_member' && (
        <p className="text-xs text-slate-500 px-1">
          Members aren&apos;t added to the guest pipeline — they&apos;re already in. Scan count is tracked so we can see networking activity.
        </p>
      )}
    </div>
  );
}
