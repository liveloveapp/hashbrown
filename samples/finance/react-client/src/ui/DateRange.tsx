import React, { useMemo, useState } from 'react';
import { type ISODate } from '../lib/ingredients';

export function DateRange(props: { initialStart: Date; initialEnd: Date; onChange?: (range: { startDate: ISODate; endDate: ISODate }) => void }) {
  const [start, setStart] = useState(props.initialStart);
  const [end, setEnd] = useState(props.initialEnd);

  const toISO = (d: Date): ISODate => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}` as ISODate;
  };

  const startISO = useMemo(() => toISO(start), [start]);
  const endISO = useMemo(() => toISO(end), [end]);

  return (
    <div>
      <label>
        Start
        <input type="date" value={startISO} onChange={(e) => setStart(new Date(e.target.value))} />
      </label>
      <label>
        End
        <input type="date" value={endISO} onChange={(e) => setEnd(new Date(e.target.value))} />
      </label>
      <button
        onClick={() => props.onChange?.({ startDate: startISO, endDate: endISO })}
        aria-label="Apply date range"
      >
        Apply
      </button>
    </div>
  );
}
