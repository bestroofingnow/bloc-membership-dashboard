'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ScanMatch {
  // Match resolution
  matchType: 'new_guest' | 'existing_guest' | 'existing_member' | 'no_email' | 'no_persistence';
  // When matchType = existing_guest, this is the guest id (or new guest id if matchType = new_guest)
  guestId: string | null;
  // When matchType = existing_member, this is the member id
  memberId: string | null;
  // Display name of the matched member (for UI)
  memberName: string | null;
  // Display name of the matched guest (for UI)
  guestName: string | null;
  // Total times this email has been scanned (including this scan)
  scanCount: number;
}

export interface ScannedCard extends ScanMatch {
  scanId: string | null;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  linkedin: string;
  additionalNotes: string;
}

interface ScanResult {
  success: boolean;
  scanId: string | null;
  match: ScanMatch;
  data: Omit<ScannedCard, keyof ScanMatch | 'scanId'>;
}

export function useCardScanner() {
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedCard, setScannedCard] = useState<ScannedCard | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  const scanCard = useCallback(async (file: File) => {
    setScanning(true);
    setError(null);
    setScannedCard(null);
    setExportSuccess(false);

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Include the caller's JWT so the server can record who did the scan
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const response = await fetch('/api/scan', {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const result: ScanResult | { error: string } = await response.json();

      if (!response.ok || 'error' in result) {
        setError('error' in result ? result.error : 'Failed to scan business card');
        return null;
      }

      const card: ScannedCard = {
        ...result.data,
        scanId: result.scanId,
        ...result.match,
      };
      setScannedCard(card);
      return card;
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      return null;
    } finally {
      setScanning(false);
    }
  }, []);

  const exportToCRM = useCallback(async (card?: ScannedCard) => {
    const cardToExport = card || scannedCard;
    if (!cardToExport) {
      setError('No scanned card data to export');
      return false;
    }

    setExporting(true);
    setError(null);
    setExportSuccess(false);

    try {
      const response = await fetch('/api/scan/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId: cardToExport.scanId,
          name: cardToExport.name,
          title: cardToExport.title,
          company: cardToExport.company,
          email: cardToExport.email,
          phone: cardToExport.phone,
          address: cardToExport.address,
          website: cardToExport.website,
          linkedin: cardToExport.linkedin,
          additionalNotes: cardToExport.additionalNotes,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to export contact');
        return false;
      }

      setExportSuccess(true);
      return true;
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      return false;
    } finally {
      setExporting(false);
    }
  }, [scannedCard]);

  const reset = useCallback(() => {
    setScannedCard(null);
    setError(null);
    setExportSuccess(false);
  }, []);

  const updateField = useCallback((field: keyof ScannedCard, value: string) => {
    setScannedCard((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }, []);

  return {
    scanning,
    exporting,
    error,
    scannedCard,
    exportSuccess,
    scanCard,
    exportToCRM,
    reset,
    updateField,
    clearError: () => setError(null),
  };
}
