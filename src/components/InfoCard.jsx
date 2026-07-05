import React from 'react';
import { Info } from './Icons';

export const InfoCard = ({ title, steps, icon: Icon = Info }) => {
  const visibleSteps = (steps || []).filter(Boolean).slice(0, 3);

  return (
  <div role="note" className="app-card-quiet mt-6 flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-start">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-google-blue/10 text-google-blue"><Icon className="w-5 h-5" /></div>
    <div className="min-w-0 flex-1">
      <h4 className="font-medium text-m3-on-surface">{title}</h4>
      <div className="mt-3 flex flex-wrap gap-2 text-m3-on-surface-variant">
        {visibleSteps.map((step, i) => (
          <span key={i} className="app-chip max-w-full bg-white/70">
            <span className="truncate">{step}</span>
          </span>
        ))}
      </div>
    </div>
  </div>
  );
};
