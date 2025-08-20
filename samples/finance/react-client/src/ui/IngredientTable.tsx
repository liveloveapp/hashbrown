import React, { useEffect, useMemo, useState } from 'react';
import { fetchIngredients, type Ingredient, type IngredientCategory, type ISODate } from '../lib/ingredients';

export function IngredientTable(props: { category: IngredientCategory | 'All'; onCategoryChange: (c: IngredientCategory | 'All') => void; dateRange: { startDate: ISODate; endDate: ISODate } }) {
  const [data, setData] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const items = await fetchIngredients({ startDate: props.dateRange.startDate, endDate: props.dateRange.endDate });
        setData(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [props.dateRange.startDate, props.dateRange.endDate]);

  const categories = useMemo(() => {
    const c = new Set<IngredientCategory>();
    for (const i of data) c.add(i.category);
    return ['All', ...Array.from(c).sort()] as const;
  }, [data]);

  const filtered = useMemo(() => {
    return props.category === 'All' ? data : data.filter((d) => d.category === props.category);
  }, [data, props.category]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Category
          <select value={props.category} onChange={(e) => props.onCategoryChange(e.target.value as IngredientCategory | 'All')}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Unit</th>
            <th>Inventory</th>
            <th>Unit Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{i.category}</td>
              <td>{i.unit}</td>
              <td>{i.currentInventory}</td>
              <td>{i.currentUnitCostUSD.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'salmon' }}>{error}</p>}
    </div>
  );
}
