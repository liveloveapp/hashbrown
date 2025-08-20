import React, { useMemo, useState } from 'react';
import { DateRange } from './DateRange';
import { IngredientTable } from './IngredientTable';
import { ModelPicker } from './ModelPicker';
import { ChatBox } from './ChatBox';
import { type IngredientCategory, type ISODate } from '../lib/ingredients';
import { type KnownModelIds } from '@hashbrownai/core';
import './App.css';

export function App() {
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | 'All'>('All');
  const [model, setModel] = useState<KnownModelIds>('gpt-4o-mini');

  const today = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const end = useMemo(() => today, [today]);

  const [dateRange, setDateRange] = useState<{ startDate: ISODate; endDate: ISODate }>(() => {
    const toISO = (d: Date): ISODate => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}` as ISODate;
    };
    return { startDate: toISO(start), endDate: toISO(end) };
  });

  return (
    <div className="container">
      <header>
        <h1>Finance React Client</h1>
        <ModelPicker value={model} onChange={(m: KnownModelIds) => setModel(m)} />
      </header>
      <main>
        <aside>
          <DateRange initialStart={start} initialEnd={end} onChange={(r: { startDate: ISODate; endDate: ISODate }) => setDateRange(r)} />
        </aside>
        <section>
          <IngredientTable category={categoryFilter} onCategoryChange={setCategoryFilter} dateRange={dateRange} />
        </section>
      </main>
      {/* <footer>
        <ChatBox model={model} />
      </footer> */}
    </div>
  );
}
