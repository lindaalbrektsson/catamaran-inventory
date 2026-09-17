'use client';
import { useEffect, useRef } from 'react';
import { recordDocumentOpen } from '@/lib/document-usage';
export function DocumentOpened({ userId, documentId }: { userId: string; documentId: string }) {
  const counted = useRef('');
  useEffect(() => {
    const identity = `${userId}:${documentId}`;
    if (counted.current !== identity) {
      counted.current = identity;
      recordDocumentOpen(userId, documentId);
    }
  }, [userId, documentId]);
  return null;
}
