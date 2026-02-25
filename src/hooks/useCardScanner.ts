'use client';

import { useState, useCallback } from 'react';

export interface ScannedCard {
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
  data: ScannedCard;
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

      const response = await fetch('/api/scan', {
        method: 'POST',
        body: formData,
      });

      const result: ScanResult | { error: string } = await response.json();

      if (!response.ok || 'error' in result) {
        setError('error' in result ? result.error : 'Failed to scan business card');
        return null;
      }

      const card: ScannedCard = {
        ...result.data,
        scanId: result.scanId,
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
