'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useNcrpComplaint } from '@/lib/demo/store';

/**
 * Clear the demo so the whole flow can be run again.
 *
 * It exists for the twentieth rehearsal, not for the product: a presentation
 * that can only be given once is one that gets debugged in front of judges.
 *
 * Two clicks rather than one, because a stray click on this mid-run would end
 * the demo in the middle of a sentence. The confirmation replaces the button in
 * place and shares its width — a control that grows when armed shifts whatever
 * is under it, and in the sidebar that is the rest of the navigation.
 *
 * It clears **both** halves — the portal's complaint record and the console's
 * walkthrough — because clearing one alone leaves the console showing a case
 * for a complaint the portal no longer has, which is precisely the disagreement
 * between two screens this whole flow exists to avoid.
 *
 * Nothing here reaches the API: rows already written by a run stay written, and
 * are what `/cases` and `/alerts` go on listing. This resets the demonstration,
 * not the database.
 */
export function ResetDemoButton({
  className = '',
  redirectTo,
  label = 'Reset demo',
}: {
  /** Applied to each button. Do not include a width — the row owns that. */
  className?: string;
  /** Where to land afterwards. Omitted, the current page re-renders empty. */
  redirectTo?: string;
  label?: string;
}) {
  const { reset, stage } = useNcrpComplaint();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const button = `flex-1 whitespace-nowrap text-center ${className}`;

  if (confirming) {
    return (
      <span className="flex w-full items-stretch gap-1">
        <button
          type="button"
          className={button}
          onClick={() => {
            reset();
            setConfirming(false);
            if (redirectTo !== undefined) router.push(redirectTo);
          }}
        >
          Confirm
        </button>
        <button type="button" className={button} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="flex w-full">
      <button
        type="button"
        disabled={stage === 'NONE'}
        title={stage === 'NONE' ? 'Nothing to reset — no complaint has been filed' : undefined}
        className={`${button} ${stage === 'NONE' ? 'cursor-not-allowed opacity-40' : ''}`}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    </span>
  );
}
