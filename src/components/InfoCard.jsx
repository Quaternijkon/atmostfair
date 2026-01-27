import React from 'react';
import { Info } from './Icons';

export const InfoCard = ({ title, steps, icon: Icon = Info }) => (
  <div className="mt-8 bg-m3-surface-container-low p-6 rounded-[24px] border border-m3-outline-variant/30 flex gap-4 text-sm">
    <div className="mt-1 text-m3-on-surface-variant"><Icon className="w-5 h-5" /></div>
    <div className="flex-1">
      <h4 className="font-medium text-m3-on-surface mb-2">{title}</h4>
      <ol className="list-decimal list-inside space-y-1 text-m3-on-surface-variant marker:text-m3-on-surface-variant/50">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  </div>
);
